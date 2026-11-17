import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { chatLimiter } from '../middleware/rateLimit.js';
import Tenant from '../models/Tenant.js';
import BusinessProfile from '../models/BusinessProfile.js';
import AiAgent from '../models/AiAgent.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import { getOrCreateConversation, processIncomingMessage } from '../services/chat.js';
import { bookAppointment, checkAvailability } from '../services/booking.js';
import { addMinutes } from '../utils/date.js';

const router = Router();

/** Resolves a public tenant by slug. Never exposes tenant ids to clients. */
async function resolveTenant(slug) {
  const tenant = await Tenant.findOne({ slug: String(slug).toLowerCase() }).select('_id name slug status industry').lean();
  if (!tenant) throw ApiError.notFound('Chat widget not found');
  if (tenant.status !== 'active') throw ApiError.forbidden('This chat widget is currently unavailable');
  return tenant;
}

router.get(
  '/widget/:slug/config',
  asyncHandler(async (req, res) => {
    const tenant = await resolveTenant(req.params.slug);
    const [profile, agent] = await Promise.all([
      BusinessProfile.findOne({ tenantId: tenant._id }).lean(),
      AiAgent.findOne({ tenantId: tenant._id, isActive: true, isDefault: true }).lean() ||
        AiAgent.findOne({ tenantId: tenant._id, isActive: true }).lean(),
    ]);

    if (profile && profile.widget && profile.widget.isEnabled === false) {
      throw ApiError.forbidden('This chat widget is disabled');
    }

    return ok(res, {
      business: {
        name: profile?.name || tenant.name,
        logoUrl: profile?.logoUrl || '',
        city: profile?.city || '',
        website: profile?.website || '',
        languages: profile?.languages || ['English'],
      },
      widget: {
        primaryColor: profile?.widget?.primaryColor || '#4f46e5',
        position: profile?.widget?.position || 'right',
        welcomeMessage: profile?.widget?.welcomeMessage || agent?.greeting || 'Hi! How can we help you today?',
        showBranding: profile?.widget?.showBranding !== false,
        agentName: agent?.name || 'AI Assistant',
      },
      demoAvailable: profile?.coaching?.demoAvailable !== false,
    });
  }),
);

router.post(
  '/widget/:slug/chat',
  chatLimiter,
  validate(
    z.object({
      message: z.string().min(1).max(2000),
      visitorId: z.string().min(6).max(80),
      name: z.string().max(120).optional().default(''),
      phone: z.string().max(24).optional().default(''),
    }),
  ),
  asyncHandler(async (req, res) => {
    const tenant = await resolveTenant(req.params.slug);
    const { message, visitorId, name, phone } = req.body;

    const agent = await AiAgent.findOne({ tenantId: tenant._id, isActive: true }).sort({ isDefault: -1 }).lean();
    const conversation = await getOrCreateConversation({
      tenantId: tenant._id,
      channel: 'website',
      visitorId,
      customerName: name || 'Website visitor',
      customerPhone: phone || '',
      agentId: agent?._id || null,
    });

    if (name && conversation.customerName === 'Website visitor') conversation.customerName = name;
    if (phone) conversation.customerPhone = phone;

    const outcome = await processIncomingMessage({
      tenantId: tenant._id,
      conversation,
      text: message,
      channel: 'website',
      authorName: name || 'Website visitor',
    });

    return ok(res, {
      conversationId: String(conversation._id),
      reply: outcome.aiMessage?.content || null,
      escalated: outcome.conversation?.status === 'handoff',
      aiEnabled: outcome.conversation?.aiEnabled !== false,
      sources: outcome.aiMessage?.sources || [],
    });
  }),
);

router.get(
  '/widget/:slug/messages',
  chatLimiter,
  asyncHandler(async (req, res) => {
    const tenant = await resolveTenant(req.params.slug);
    const visitorId = String(req.query.visitorId || '');
    if (!visitorId) throw ApiError.badRequest('visitorId is required');

    const conversation = await Conversation.findOne({ tenantId: tenant._id, visitorId, channel: 'website' }).sort({
      lastMessageAt: -1,
    });
    if (!conversation) return ok(res, { messages: [] });

    const messages = await Message.find({ tenantId: tenant._id, conversationId: conversation._id })
      .sort({ createdAt: 1 })
      .limit(100)
      .lean();

    return ok(res, {
      conversationId: String(conversation._id),
      aiEnabled: conversation.aiEnabled,
      messages: messages.map((message) => ({
        id: String(message._id),
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      })),
    });
  }),
);

router.get(
  '/widget/:slug/availability',
  asyncHandler(async (req, res) => {
    const tenant = await resolveTenant(req.params.slug);
    const date = String(req.query.date || new Date().toISOString().slice(0, 10));
    const profile = await BusinessProfile.findOne({ tenantId: tenant._id }).lean();
    const [openHour, openMinute] = String(profile?.openingTime || '09:00').split(':').map(Number);

    const start = new Date(`${date}T00:00:00`);
    start.setHours(openHour || 9, openMinute || 0, 0, 0);

    const availability = await checkAvailability({
      tenantId: tenant._id,
      startAt: start,
      endAt: addMinutes(start, 45),
    });

    return ok(res, {
      date,
      slots: availability.available
        ? [{ startAt: start, available: true }]
        : [{ startAt: start, available: false, reason: availability.reason }],
    });
  }),
);

router.post(
  '/widget/:slug/appointments',
  chatLimiter,
  validate(
    z.object({
      name: z.string().min(2).max(160),
      phone: z.string().min(6).max(24),
      email: z.string().max(160).optional().default(''),
      course: z.string().max(160).optional().default(''),
      date: z.string().min(10).max(10),
      time: z.string().min(4).max(5),
      visitorId: z.string().max(80).optional().default(''),
    }),
  ),
  asyncHandler(async (req, res) => {
    const tenant = await resolveTenant(req.params.slug);
    const { name, phone, email, course, date, time } = req.body;

    const startAt = new Date(`${date}T${time}:00`);
    if (Number.isNaN(startAt.getTime())) throw ApiError.badRequest('Invalid date or time');

    const conversation = await Conversation.findOne({
      tenantId: tenant._id,
      channel: 'website',
      ...(req.body.visitorId ? { visitorId: req.body.visitorId } : { customerPhone: phone }),
    }).sort({ lastMessageAt: -1 });

    const appointment = await bookAppointment({
      tenantId: tenant._id,
      channel: 'website',
      payload: {
        customerName: name,
        customerPhone: phone,
        customerEmail: email,
        course,
        type: 'demo',
        startAt,
        customerId: conversation?.customerId || null,
      },
    });

    if (conversation) {
      await Message.create({
        tenantId: tenant._id,
        conversationId: conversation._id,
        role: 'system',
        content: `Demo class booked for ${startAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`,
      });
    }

    return created(res, {
      appointment: {
        id: String(appointment._id),
        startAt: appointment.startAt,
        status: appointment.status,
        type: appointment.type,
      },
    });
  }),
);

/** Widget embed script loader (served same-origin, no secrets inside). */
router.get(
  '/widget/:slug/embed.js',
  asyncHandler(async (req, res) => {
    await resolveTenant(req.params.slug);
    const origin = `${req.protocol}://${req.get('host')}`;
    const slug = String(req.params.slug).replace(/[^a-z0-9-]/gi, '');
    const nonce = crypto.randomBytes(4).toString('hex');
    const script = `(function(){var d=document;var b=d.createElement('button');b.textContent='Chat';b.setAttribute('aria-label','Open chat');b.style.cssText='position:fixed;bottom:20px;right:20px;z-index:2147483000;background:#4f46e5;color:#fff;border:none;border-radius:999px;padding:14px 20px;font:600 14px system-ui;cursor:pointer;box-shadow:0 10px 25px rgba(79,70,229,.35)';b.onclick=function(){window.open('${origin}/chat/${slug}','unique-ai-chat','width=420,height=640');};d.body.appendChild(b);})();/*${nonce}*/`;
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.send(script);
  }),
);

export default router;
