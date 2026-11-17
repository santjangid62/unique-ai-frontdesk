import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, paginated, parsePaging } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { requireTenantUser, resolveTenantId, tenantScopeGuard } from '../middleware/rbac.js';
import { audit } from '../utils/audit.js';
import { staffReply } from '../services/chat.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import Call from '../models/Call.js';
import User from '../models/User.js';

const router = Router();
router.use(authenticate, tenantScopeGuard, requireTenantUser);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const { page, limit, skip } = parsePaging(req.query);
    const filter = { tenantId };
    if (req.query.channel) filter.channel = req.query.channel;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.assigned === 'me') filter.assignedTo = req.user.id;
    if (req.query.handoff === 'true') filter.status = 'handoff';
    // Staff work their own queue plus unclaimed handoffs; admins see everything.
    if (req.user.role === 'staff') {
      filter.$or = [{ assignedTo: req.user.id }, { assignedTo: null }];
    }
    if (req.query.search) {
      const term = String(req.query.search).trim();
      const searchOr = [
        { customerName: { $regex: term, $options: 'i' } },
        { customerPhone: { $regex: term, $options: 'i' } },
        { lastMessagePreview: { $regex: term, $options: 'i' } },
      ];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
        delete filter.$or;
      } else {
        filter.$or = searchOr;
      }
    }

    const [items, total, counts] = await Promise.all([
      Conversation.find(filter)
        .populate('assignedTo', 'name')
        .sort({ lastMessageAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Conversation.countDocuments(filter),
      Conversation.aggregate([
        { $match: { tenantId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    return ok(
      res,
      items.map((item) => ({ ...item, id: String(item._id) })),
      {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        statusCounts: Object.fromEntries(counts.map((row) => [row._id, row.count])),
      },
    );
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const conversation = await Conversation.findOne({ _id: req.params.id, tenantId })
      .populate('assignedTo', 'name email')
      .lean();
    if (!conversation) throw ApiError.notFound('Conversation not found');

    const [messages, calls] = await Promise.all([
      Message.find({ tenantId, conversationId: conversation._id }).sort({ createdAt: 1 }).limit(300).lean(),
      conversation.customerPhone
        ? Call.find({ tenantId, from: conversation.customerPhone }).sort({ startedAt: -1 }).limit(5).lean()
        : Promise.resolve([]),
    ]);

    if (conversation.unreadForStaff) {
      await Conversation.updateOne({ _id: conversation._id }, { $set: { unreadForStaff: 0 } });
    }

    return ok(res, {
      conversation: { ...conversation, id: String(conversation._id) },
      messages: messages.map((message) => ({ ...message, id: String(message._id) })),
      calls,
    });
  }),
);

router.post(
  '/:id/reply',
  validate(z.object({ text: z.string().min(1).max(4000) })),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const conversation = await Conversation.findOne({ _id: req.params.id, tenantId });
    if (!conversation) throw ApiError.notFound('Conversation not found');

    const message = await staffReply({ tenantId, conversation, text: req.body.text, user: req.user });
    await audit(req, {
      action: 'conversation.staff_reply',
      entity: 'Conversation',
      entityId: conversation._id,
      meta: { messageId: String(message._id) },
    });
    return ok(res, message.toJSON());
  }),
);

router.patch(
  '/:id/handoff',
  validate(
    z.object({
      assignedTo: z.string().length(24).nullable().optional(),
      reason: z.string().max(300).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const conversation = await Conversation.findOne({ _id: req.params.id, tenantId });
    if (!conversation) throw ApiError.notFound('Conversation not found');

    if (req.body.assignedTo) {
      const assignee = await User.findOne({ _id: req.body.assignedTo, tenantId, isActive: true }).select('_id').lean();
      if (!assignee) throw ApiError.badRequest('Assignee must be an active team member');
    }

    conversation.status = 'handoff';
    conversation.aiEnabled = false;
    conversation.assignedTo = req.body.assignedTo || req.user.id;
    conversation.escalationReason = req.body.reason || conversation.escalationReason || 'Taken over by staff';
    conversation.escalatedAt = conversation.escalatedAt || new Date();
    await conversation.save();

    await Message.create({
      tenantId,
      conversationId: conversation._id,
      role: 'system',
      content: `Conversation handed off to ${req.user.name}`,
    });
    await audit(req, {
      action: 'conversation.handoff',
      entity: 'Conversation',
      entityId: conversation._id,
      meta: { assignedTo: conversation.assignedTo },
    });
    return ok(res, conversation.toJSON());
  }),
);

router.patch(
  '/:id/resume-ai',
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (req.user.role !== 'business_admin') throw ApiError.forbidden('Only a business admin can resume the AI');
    const conversation = await Conversation.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: { aiEnabled: true, status: 'open', escalationReason: null } },
      { new: true },
    );
    if (!conversation) throw ApiError.notFound('Conversation not found');
    await Message.create({
      tenantId,
      conversationId: conversation._id,
      role: 'system',
      content: 'AI assistant resumed',
    });
    return ok(res, conversation.toJSON());
  }),
);

router.patch(
  '/:id/close',
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const conversation = await Conversation.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: { status: 'closed', aiEnabled: false, unreadForStaff: 0 } },
      { new: true },
    );
    if (!conversation) throw ApiError.notFound('Conversation not found');
    await audit(req, { action: 'conversation.closed', entity: 'Conversation', entityId: conversation._id });
    return ok(res, conversation.toJSON());
  }),
);

export default router;

export const callsRouter = Router();
callsRouter.use(authenticate, tenantScopeGuard, requireTenantUser);
callsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const { page, limit, skip } = parsePaging(req.query);
    const filter = { tenantId };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.from) filter.startedAt = { $gte: new Date(req.query.from) };

    const [items, total] = await Promise.all([
      Call.find(filter).sort({ startedAt: -1 }).skip(skip).limit(limit).lean(),
      Call.countDocuments(filter),
    ]);
    return paginated(res, items.map((item) => ({ ...item, id: String(item._id) })), { page, limit, total });
  }),
);
