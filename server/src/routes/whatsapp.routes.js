import { Router } from 'express';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/response.js';
import { audit } from '../utils/audit.js';
import { webhookLimiter } from '../middleware/rateLimit.js';
import Integration from '../models/Integration.js';
import Tenant from '../models/Tenant.js';
import { getOrCreateConversation, processIncomingMessage } from '../services/chat.js';
import { recordUsage } from '../services/usage.js';
import { normalizePhone } from '../services/crm.js';

const router = Router();

/** Meta webhook verification handshake. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === env.whatsappVerifyToken) {
      return res.status(200).send(String(challenge || ''));
    }
    await audit(req, { action: 'whatsapp.verification_failed', severity: 'warning' });
    return res.status(403).send('Verification failed');
  }),
);

/** X-Hub-Signature-256 validation against the raw request body. */
function verifySignature(req) {
  if (!env.whatsappAppSecret) return !env.isProd;
  const signature = req.header('X-Hub-Signature-256');
  if (!signature) return false;
  const expected = `sha256=${crypto.createHmac('sha256', env.whatsappAppSecret).update(req.rawBody || Buffer.from('')).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function resolveTenantForPhoneNumber(phoneNumberId) {
  if (!phoneNumberId) return null;
  const integration = await Integration.findOne({
    provider: 'whatsapp',
    $or: [{ externalId: String(phoneNumberId) }, { 'config.phoneNumberId': String(phoneNumberId) }],
  }).lean();
  if (!integration) return null;
  return Tenant.findById(integration.tenantId).lean();
}

/** Sends a WhatsApp text reply using the tenant's stored Cloud API credentials. */
async function sendWhatsAppText({ integration, to, body }) {
  const token = integration?.config?.accessToken;
  const phoneNumberId = integration?.externalId || integration?.config?.phoneNumberId;
  if (!token || !phoneNumberId) {
    console.warn('[whatsapp] no Cloud API credentials configured for tenant; reply stored only');
    return { sent: false, reason: 'missing_credentials' };
  }
  try {
    const response = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: body.slice(0, 4000) },
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error('[whatsapp] send failed', response.status, detail.slice(0, 300));
      return { sent: false, reason: `provider_${response.status}` };
    }
    return { sent: true };
  } catch (error) {
    console.error('[whatsapp] send error', error.message);
    return { sent: false, reason: 'network_error' };
  }
}

router.post(
  '/',
  webhookLimiter,
  asyncHandler(async (req, res) => {
    if (!verifySignature(req)) {
      await audit(req, { action: 'whatsapp.invalid_signature', severity: 'critical' });
      return res.status(403).json({ success: false, error: { code: 'INVALID_SIGNATURE', message: 'Invalid signature' } });
    }

    // Acknowledge immediately; Meta retries when the response is slow.
    res.status(200).json({ success: true, data: { received: true } });

    try {
      const entries = req.body?.entry || [];
      for (const entry of entries) {
        for (const change of entry.changes || []) {
          const value = change.value || {};
          const phoneNumberId = value.metadata?.phone_number_id;
          const tenant = await resolveTenantForPhoneNumber(phoneNumberId);
          if (!tenant) continue;

          const integration = await Integration.findOne({
            tenantId: tenant._id,
            provider: 'whatsapp',
          }).lean();

          for (const message of value.messages || []) {
            if (!['text', 'interactive', 'button'].includes(message.type)) continue;
            const text =
              message.text?.body ||
              message.interactive?.button_reply?.title ||
              message.button?.text ||
              '';
            if (!text.trim()) continue;

            const conversation = await getOrCreateConversation({
              tenantId: tenant._id,
              channel: 'whatsapp',
              customerPhone: normalizePhone(message.from),
              customerName: value.contacts?.[0]?.profile?.name || 'WhatsApp customer',
            });

            const outcome = await processIncomingMessage({
              tenantId: tenant._id,
              conversation,
              text,
              channel: 'whatsapp',
              authorName: value.contacts?.[0]?.profile?.name || 'WhatsApp customer',
            });

            await recordUsage(tenant._id, 'whatsapp', 1, { messageId: message.id });
            if (outcome.aiMessage?.content) {
              await sendWhatsAppText({
                integration,
                to: normalizePhone(message.from),
                body: outcome.aiMessage.content,
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('[whatsapp] processing error', error);
    }
  }),
);

export default router;
