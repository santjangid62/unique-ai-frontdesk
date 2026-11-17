import { Router } from 'express';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/response.js';
import { audit } from '../utils/audit.js';
import { webhookLimiter } from '../middleware/rateLimit.js';
import Tenant from '../models/Tenant.js';
import Integration from '../models/Integration.js';
import BusinessProfile from '../models/BusinessProfile.js';
import AiAgent from '../models/AiAgent.js';
import Call from '../models/Call.js';
import Lead from '../models/Lead.js';
import { getOrCreateConversation, processIncomingMessage } from '../services/chat.js';
import { recordUsage } from '../services/usage.js';
import { normalizePhone } from '../services/crm.js';

const router = Router();

/**
 * Verifies Twilio's X-Twilio-Signature: base64(HMAC-SHA1(url + sorted params)).
 * Rejected when the provider token is configured; unsigned local testing is
 * allowed only outside production.
 */
function verifyTwilioSignature(req) {
  if (!env.twilioAuthToken) return !env.isProd;
  const signature = req.header('X-Twilio-Signature');
  if (!signature) return false;

  const url = `${env.isProd ? 'https' : req.protocol}://${req.get('host')}${req.originalUrl}`;
  const params = Object.keys(req.body || {})
    .sort()
    .reduce((acc, key) => acc + key + String(req.body[key]), '');
  const expected = crypto.createHmac('sha1', env.twilioAuthToken).update(url + params).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Maps the dialled number to a tenant through its Twilio integration. */
async function resolveTenantByNumber(to) {
  const normalized = normalizePhone(to);
  const integration = await Integration.findOne({
    provider: 'twilio',
    status: 'connected',
    $or: [{ 'config.phoneNumber': normalized }, { externalId: normalized }],
  }).lean();
  if (integration) return Tenant.findById(integration.tenantId).lean();
  if (!env.isProd && !normalized) return Tenant.findOne({ status: 'active' }).lean();
  return null;
}

const twiml = (body) => `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;

router.post(
  '/incoming',
  webhookLimiter,
  asyncHandler(async (req, res) => {
    if (!verifyTwilioSignature(req)) {
      await audit(req, { action: 'voice.invalid_signature', severity: 'critical', meta: { from: req.body?.From } });
      return res.status(403).type('text/xml').send(twiml('<Say>This call could not be verified.</Say><Hangup/>'));
    }

    const tenant = await resolveTenantByNumber(req.body.To);
    if (!tenant) {
      return res.status(404).type('text/xml').send(twiml('<Say>Sorry, this number is not configured.</Say><Hangup/>'));
    }

    const agent = await AiAgent.findOne({ tenantId: tenant._id, isActive: true }).sort({ isDefault: -1 }).lean();
    if (!agent) {
      return res.type('text/xml').send(twiml('<Say>Sorry, our receptionist is unavailable right now.</Say><Hangup/>'));
    }
    const profile = await BusinessProfile.findOne({ tenantId: tenant._id }).lean();

    const call = await Call.create({
      tenantId: tenant._id,
      provider: 'twilio',
      providerCallId: req.body.CallSid || '',
      from: normalizePhone(req.body.From),
      to: normalizePhone(req.body.To),
      status: 'in_progress',
      consentGiven: true,
    });

    if (call.from) {
      const existing = await Lead.findOne({ tenantId: tenant._id, phone: call.from, isDeleted: false });
      if (existing) {
        call.leadId = existing._id;
        await call.save();
      }
    }

    const greeting = agent.greeting || profile?.widget?.welcomeMessage || 'Hello! How can I help you today?';
    const action = `/api/voice/gather?callId=${call._id}&tenantId=${tenant._id}`;

    return res
      .type('text/xml')
      .send(
        twiml(
          `<Gather input="speech" speechTimeout="auto" language="en-IN" action="${action}" method="POST"><Say voice="Polly.Joanna">${greeting.replace(
            /[<>&]/g,
            '',
          )} This is an automated assistant.</Say></Gather><Say>We did not receive any input. Goodbye.</Say><Hangup/>`,
        ),
      );
  }),
);

/** Speech result -> AI reply -> spoken TwiML. */
router.post(
  '/gather',
  webhookLimiter,
  asyncHandler(async (req, res) => {
    const { callId, tenantId } = req.query;
    const call = await Call.findOne({ _id: callId, tenantId });
    if (!call) return res.status(404).type('text/xml').send(twiml('<Say>Call record not found.</Say><Hangup/>'));

    const speech = String(req.body.SpeechResult || '').trim();
    if (!speech) {
      return res
        .type('text/xml')
        .send(
          twiml(
            `<Say>Sorry, I could not hear that.</Say><Redirect>/api/voice/gather?callId=${call._id}&amp;tenantId=${tenantId}</Redirect>`,
          ),
        );
    }

    call.transcript.push({ role: 'customer', text: speech });
    await call.save();

    const conversation = await getOrCreateConversation({
      tenantId: tenantId,
      channel: 'voice',
      customerPhone: call.from,
      customerName: call.from || 'Caller',
    });

    const outcome = await processIncomingMessage({
      tenantId: tenantId,
      conversation,
      text: speech,
      channel: 'voice',
      authorName: 'Caller',
    });

    const replyText = (outcome.aiMessage?.content || 'Let me connect you with our team.').replace(/[<>&]/g, '');
    call.transcript.push({ role: 'ai', text: replyText });
    call.durationSeconds += 30;
    await call.save();
    await recordUsage(tenantId, 'voice', 0.5, { callId: String(call._id) });

    const action = `/api/voice/gather?callId=${call._id}&tenantId=${tenantId}`;
    return res
      .type('text/xml')
      .send(
        twiml(
          `<Gather input="speech" speechTimeout="auto" language="en-IN" action="${action}" method="POST"><Say voice="Polly.Joanna">${replyText}</Say></Gather><Say>Thank you for calling. Goodbye.</Say><Hangup/>`,
        ),
      );
  }),
);

router.post(
  '/status',
  webhookLimiter,
  asyncHandler(async (req, res) => {
    const { CallSid, CallStatus, CallDuration } = req.body || {};
    if (CallSid) {
      const call = await Call.findOne({ providerCallId: CallSid });
      if (call) {
        const map = {
          completed: 'completed',
          busy: 'failed',
          failed: 'failed',
          'no-answer': 'missed',
          canceled: 'failed',
          'in-progress': 'in_progress',
          ringing: 'ringing',
        };
        call.status = map[CallStatus] || call.status;
        call.durationSeconds = Number(CallDuration) || call.durationSeconds;
        if (['completed', 'failed', 'missed'].includes(call.status)) call.endedAt = new Date();
        await call.save();
      }
    }
    return ok(res, { received: true });
  }),
);

router.post(
  '/transfer',
  webhookLimiter,
  asyncHandler(async (req, res) => {
    const { callId } = req.body || {};
    const call = await Call.findOne({ _id: callId });
    if (!call) return res.status(404).type('text/xml').send(twiml('<Say>Call not found.</Say><Hangup/>'));

    const profile = await BusinessProfile.findOne({ tenantId: call.tenantId }).lean();
    const target = req.body.to || profile?.phone;
    if (!target) return res.type('text/xml').send(twiml('<Say>No transfer number is configured.</Say><Hangup/>'));

    call.status = 'transferred';
    call.transferredTo = target;
    call.handledByAi = false;
    await call.save();

    return res.type('text/xml').send(twiml(`<Say>Connecting you to our team.</Say><Dial>${target}</Dial>`));
  }),
);

export default router;
