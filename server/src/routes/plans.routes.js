import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { requireSuperAdmin, requireBusinessAdmin, resolveTenantId } from '../middleware/rbac.js';
import { audit } from '../utils/audit.js';
import { ensureDefaultPlans } from '../services/plans.js';
import { getUsageSummary } from '../services/usage.js';
import Plan from '../models/Plan.js';
import Subscription from '../models/Subscription.js';
import Tenant from '../models/Tenant.js';

const router = Router();

const planSchema = z.object({
  code: z.string().min(2).max(40).transform((v) => v.toLowerCase().trim()),
  name: z.string().min(2).max(80),
  description: z.string().max(500).optional().default(''),
  priceMonthly: z.coerce.number().min(0),
  priceYearly: z.coerce.number().min(0).optional().default(0),
  currency: z.string().max(4).optional().default('INR'),
  limits: z
    .object({
      agents: z.coerce.number().min(0).optional(),
      staff: z.coerce.number().min(0).optional(),
      knowledgeEntries: z.coerce.number().min(0).optional(),
      aiMessagesPerMonth: z.coerce.number().min(0).optional(),
      voiceMinutesPerMonth: z.coerce.number().min(0).optional(),
      whatsappMessagesPerMonth: z.coerce.number().min(0).optional(),
    })
    .optional(),
  features: z.array(z.string().max(120)).optional().default([]),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.coerce.number().optional().default(0),
});

/** Public pricing catalog. */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    await ensureDefaultPlans();
    const plans = await Plan.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
    return ok(res, plans.map((plan) => ({ ...plan, id: String(plan._id) })));
  }),
);

router.post(
  '/',
  authenticate,
  requireSuperAdmin,
  validate(planSchema),
  asyncHandler(async (req, res) => {
    const exists = await Plan.findOne({ code: req.body.code }).lean();
    if (exists) throw ApiError.conflict('A plan with this code already exists');
    const plan = await Plan.create(req.body);
    await audit(req, { action: 'plan.created', entity: 'Plan', entityId: plan._id, meta: { code: plan.code } });
    return created(res, plan.toJSON());
  }),
);

router.put(
  '/:id',
  authenticate,
  requireSuperAdmin,
  validate(planSchema.partial()),
  asyncHandler(async (req, res) => {
    const plan = await Plan.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!plan) throw ApiError.notFound('Plan not found');
    await audit(req, { action: 'plan.updated', entity: 'Plan', entityId: plan._id });
    return ok(res, plan.toJSON());
  }),
);

export default router;

export const subscriptionRouter = Router();
subscriptionRouter.use(authenticate, requireBusinessAdmin);

subscriptionRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    await ensureDefaultPlans();
    const subscription = await Subscription.findOne({ tenantId }).lean();
    const plan = await Plan.findOne({ code: subscription?.planCode || 'starter' }).lean();
    const plans = await Plan.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
    const summary = await getUsageSummary(tenantId, plan);

    return ok(res, {
      subscription: subscription
        ? { ...subscription, id: String(subscription._id), invoices: (subscription.invoices || []).slice(-12).reverse() }
        : null,
      plan,
      plans,
      usage: summary.usage,
      limits: summary.limits,
      status: summary.status,
      currentPeriodEnd: summary.currentPeriodEnd,
    });
  }),
);

/**
 * Plan change. Payment capture is provider-agnostic: an invoice is recorded and
 * marked pending until a gateway (for example Razorpay) confirms the payment.
 */
subscriptionRouter.post(
  '/change-plan',
  validate(z.object({ planCode: z.string().min(2).max(40), billingCycle: z.enum(['monthly', 'yearly']).default('monthly') })),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const plan = await Plan.findOne({ code: req.body.planCode, isActive: true }).lean();
    if (!plan) throw ApiError.notFound('Plan not found');

    const amount = req.body.billingCycle === 'yearly' ? plan.priceYearly || plan.priceMonthly * 12 : plan.priceMonthly;
    const periodStart = new Date();
    const periodEnd = new Date(Date.now() + (req.body.billingCycle === 'yearly' ? 365 : 30) * 86400000);

    const subscription = await Subscription.findOneAndUpdate(
      { tenantId },
      {
        $set: {
          planCode: plan.code,
          status: 'active',
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
        },
        $push: {
          invoices: {
            number: `INV-${Date.now().toString().slice(-8)}`,
            amount,
            currency: plan.currency || 'INR',
            status: 'pending',
            periodStart,
            periodEnd,
            issuedAt: new Date(),
            provider: 'manual',
          },
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    await Tenant.updateOne({ _id: tenantId }, { $set: { planCode: plan.code } });
    await audit(req, {
      action: 'subscription.plan_changed',
      entity: 'Subscription',
      entityId: subscription._id,
      meta: { planCode: plan.code, billingCycle: req.body.billingCycle, amount },
    });

    return ok(res, {
      subscription: subscription.toJSON(),
      paymentRequired: amount > 0,
      paymentNote:
        amount > 0
          ? 'Invoice created with pending status. Connect a payment gateway to capture payment automatically.'
          : 'Plan activated.',
    });
  }),
);

subscriptionRouter.get(
  '/invoices',
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const subscription = await Subscription.findOne({ tenantId }).lean();
    return ok(res, (subscription?.invoices || []).slice().reverse());
  }),
);
