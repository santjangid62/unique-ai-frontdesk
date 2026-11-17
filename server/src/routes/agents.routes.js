import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { requireTenantUser, resolveTenantId, tenantScopeGuard } from '../middleware/rbac.js';
import { audit } from '../utils/audit.js';
import AiAgent from '../models/AiAgent.js';
import BusinessProfile from '../models/BusinessProfile.js';
import Plan from '../models/Plan.js';
import Subscription from '../models/Subscription.js';
import { retrieveKnowledge } from '../services/retrieval.js';
import { generateReply } from '../services/ai.js';

const router = Router();
router.use(authenticate, tenantScopeGuard, requireTenantUser);

const agentSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional().default(''),
  greeting: z.string().max(500).optional().default('Hello! How can I help you today?'),
  personality: z.string().max(300).optional().default('Warm, helpful and concise'),
  tone: z.enum(['friendly', 'professional', 'enthusiastic']).optional().default('friendly'),
  language: z.string().max(60).optional().default('English'),
  voice: z.string().max(60).optional().default('female-neutral'),
  instructions: z.string().max(8000).optional().default(''),
  workingHours: z
    .object({
      start: z.string().max(5).optional().default('09:00'),
      end: z.string().max(5).optional().default('19:00'),
      days: z.array(z.string().max(6)).optional().default(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']),
    })
    .optional(),
  channels: z
    .object({
      website: z.boolean().optional().default(true),
      whatsapp: z.boolean().optional().default(false),
      voice: z.boolean().optional().default(false),
    })
    .optional(),
  handoff: z
    .object({
      enabled: z.boolean().optional().default(true),
      triggers: z.array(z.string().max(60)).optional(),
      transferNumber: z.string().max(24).optional().default(''),
    })
    .optional(),
  isActive: z.boolean().optional().default(true),
  isDefault: z.boolean().optional().default(false),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const agents = await AiAgent.find({ tenantId }).sort({ isDefault: -1, createdAt: 1 }).lean();
    return ok(res, agents.map((agent) => ({ ...agent, id: String(agent._id) })));
  }),
);

router.post(
  '/',
  validate(agentSchema),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (req.user.role !== 'business_admin') throw ApiError.forbidden('Only a business admin can manage AI agents');

    const subscription = await Subscription.findOne({ tenantId }).lean();
    const plan = await Plan.findOne({ code: subscription?.planCode || 'starter' }).lean();
    const existing = await AiAgent.countDocuments({ tenantId });
    const agentLimit = plan?.limits?.agents ?? 1;
    if (existing >= agentLimit) {
      throw ApiError.forbidden(`Your ${plan?.name || 'current'} plan allows ${agentLimit} AI agent(s). Upgrade to add more.`);
    }

    const agent = await AiAgent.create({ ...req.body, tenantId });
    if (agent.isDefault || existing === 0) {
      await AiAgent.updateMany({ tenantId, _id: { $ne: agent._id } }, { $set: { isDefault: false } });
      agent.isDefault = true;
      await agent.save();
    }
    await audit(req, { action: 'ai_agent.created', entity: 'AiAgent', entityId: agent._id, meta: { name: agent.name } });
    return created(res, agent.toJSON());
  }),
);

router.put(
  '/:id',
  validate(agentSchema.partial()),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (req.user.role !== 'business_admin') throw ApiError.forbidden('Only a business admin can manage AI agents');

    const agent = await AiAgent.findOneAndUpdate({ _id: req.params.id, tenantId }, { $set: req.body }, { new: true });
    if (!agent) throw ApiError.notFound('AI agent not found');

    if (req.body.isDefault) {
      await AiAgent.updateMany({ tenantId, _id: { $ne: agent._id } }, { $set: { isDefault: false } });
    }
    await audit(req, { action: 'ai_agent.updated', entity: 'AiAgent', entityId: agent._id, meta: { fields: Object.keys(req.body) } });
    return ok(res, agent.toJSON());
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (req.user.role !== 'business_admin') throw ApiError.forbidden('Only a business admin can manage AI agents');
    const count = await AiAgent.countDocuments({ tenantId });
    if (count <= 1) throw ApiError.badRequest('Keep at least one AI agent');

    const agent = await AiAgent.findOneAndDelete({ _id: req.params.id, tenantId });
    if (!agent) throw ApiError.notFound('AI agent not found');
    if (agent.isDefault) {
      const next = await AiAgent.findOne({ tenantId }).sort({ createdAt: 1 });
      if (next) {
        next.isDefault = true;
        await next.save();
      }
    }
    await audit(req, { action: 'ai_agent.deleted', entity: 'AiAgent', entityId: agent._id, severity: 'warning' });
    return ok(res, { message: 'AI agent removed' });
  }),
);

/**
 * Playground: answers a single test question with grounded knowledge. Nothing
 * is persisted, so testing never pollutes real conversations.
 */
router.post(
  '/:id/test',
  validate(z.object({ message: z.string().min(1).max(1000) })),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const agent = await AiAgent.findOne({ _id: req.params.id, tenantId }).lean();
    if (!agent) throw ApiError.notFound('AI agent not found');

    const profile = await BusinessProfile.findOne({ tenantId }).lean();
    const knowledge = await retrieveKnowledge(tenantId, req.body.message);
    const result = await generateReply({
      agent,
      profile,
      knowledge,
      history: [],
      message: req.body.message,
      channel: 'website',
    });

    return ok(res, {
      reply: result.reply,
      intent: result.intent,
      escalate: result.escalate,
      escalationReason: result.escalationReason,
      confidence: result.confidence,
      mode: result.mode,
      sources: result.sources || [],
      knowledgeUsed: knowledge.map((item) => ({ title: item.title, score: item.score })),
    });
  }),
);

export default router;
