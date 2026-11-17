import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, paginated, parsePaging } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { requireSuperAdmin } from '../middleware/rbac.js';
import { audit } from '../utils/audit.js';
import { uniqueSlug } from '../utils/slug.js';
import Tenant from '../models/Tenant.js';
import User from '../models/User.js';
import BusinessProfile from '../models/BusinessProfile.js';
import Subscription from '../models/Subscription.js';
import Plan from '../models/Plan.js';
import Lead from '../models/Lead.js';
import Conversation from '../models/Conversation.js';
import { ensureDefaultPlans } from '../services/plans.js';

const router = Router();
router.use(authenticate, requireSuperAdmin);

const tenantBody = z.object({
  name: z.string().min(2).max(160),
  industry: z.enum(['coaching', 'healthcare', 'hotels', 'real_estate', 'salon', 'other']).default('coaching'),
  contactEmail: z.string().email().optional().or(z.literal('')),
  contactPhone: z.string().max(24).optional().default(''),
  planCode: z.string().max(40).optional().default('starter'),
  owner: z
    .object({
      name: z.string().min(2).max(120),
      email: z.string().email().transform((v) => v.toLowerCase().trim()),
      password: z.string().min(8).max(128),
    })
    .optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePaging(req.query);
    const filter = {};
    if (req.query.search) {
      filter.$or = [
        { name: { $regex: String(req.query.search).trim(), $options: 'i' } },
        { slug: { $regex: String(req.query.search).trim(), $options: 'i' } },
      ];
    }
    if (req.query.status) filter.status = req.query.status;
    if (req.query.industry) filter.industry = req.query.industry;

    const [items, total] = await Promise.all([
      Tenant.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Tenant.countDocuments(filter),
    ]);

    const tenantIds = items.map((item) => item._id);
    const [subs, owners, userCounts, leadCounts, convoCounts] = await Promise.all([
      Subscription.find({ tenantId: { $in: tenantIds } }).lean(),
      User.find({ tenantId: { $in: tenantIds }, role: 'business_admin' }).select('name email tenantId').lean(),
      User.aggregate([{ $match: { tenantId: { $in: tenantIds } } }, { $group: { _id: '$tenantId', count: { $sum: 1 } } }]),
      Lead.aggregate([{ $match: { tenantId: { $in: tenantIds }, isDeleted: false } }, { $group: { _id: '$tenantId', count: { $sum: 1 } } }]),
      Conversation.aggregate([{ $match: { tenantId: { $in: tenantIds } } }, { $group: { _id: '$tenantId', count: { $sum: 1 } } }]),
    ]);

    const subsMap = new Map(subs.map((sub) => [String(sub.tenantId), sub]));
    const ownersMap = new Map(owners.map((owner) => [String(owner.tenantId), owner]));
    const counts = (list) => new Map(list.map((row) => [String(row._id), row.count]));
    const usersByTenant = counts(userCounts);
    const leadsByTenant = counts(leadCounts);
    const convosByTenant = counts(convoCounts);

    const data = items.map((tenant) => {
      const sub = subsMap.get(String(tenant._id));
      return {
        ...tenant,
        id: String(tenant._id),
        owner: ownersMap.get(String(tenant._id)) || null,
        subscription: sub
          ? {
              planCode: sub.planCode,
              status: sub.status,
              currentPeriodEnd: sub.currentPeriodEnd,
              usage: sub.usage,
            }
          : null,
        stats: {
          users: usersByTenant.get(String(tenant._id)) || 0,
          leads: leadsByTenant.get(String(tenant._id)) || 0,
          conversations: convosByTenant.get(String(tenant._id)) || 0,
        },
      };
    });

    return paginated(res, data, { page, limit, total });
  }),
);

router.post(
  '/',
  validate(tenantBody),
  asyncHandler(async (req, res) => {
    await ensureDefaultPlans();
    const { owner, ...rest } = req.body;
    const slug = await uniqueSlug(Tenant, rest.name);

    if (owner) {
      const exists = await User.findOne({ email: owner.email }).select('_id').lean();
      if (exists) throw ApiError.conflict('A user with this email already exists');
    }

    const tenant = await Tenant.create({ ...rest, slug, status: 'active' });
    await BusinessProfile.create({
      tenantId: tenant._id,
      name: tenant.name,
      industry: tenant.industry,
      phone: tenant.contactPhone,
      email: tenant.contactEmail,
    });
    const plan = (await Plan.findOne({ code: rest.planCode }).lean()) || (await Plan.findOne({ code: 'starter' }).lean());
    await Subscription.create({
      tenantId: tenant._id,
      planCode: plan?.code || 'starter',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
    });

    let createdOwner = null;
    if (owner) {
      const user = new User({
        name: owner.name,
        email: owner.email,
        role: 'business_admin',
        tenantId: tenant._id,
        createdBy: req.user.id,
      });
      await user.setPassword(owner.password);
      await user.save();
      createdOwner = user.toSafeJSON();
      tenant.ownerId = user._id;
      await tenant.save();
    }

    await audit(req, {
      action: 'tenant.created',
      entity: 'Tenant',
      entityId: tenant._id,
      tenantId: tenant._id,
      meta: { name: tenant.name, owner: createdOwner?.email },
    });

    return ok(res, { tenant: tenant.toJSON(), owner: createdOwner }, undefined, 201);
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) throw ApiError.notFound('Business not found');
    const [profile, users, subscription, leads, conversations] = await Promise.all([
      BusinessProfile.findOne({ tenantId: tenant._id }).lean(),
      User.find({ tenantId: tenant._id }).select('name email role isActive lastLoginAt').lean(),
      Subscription.findOne({ tenantId: tenant._id }).lean(),
      Lead.countDocuments({ tenantId: tenant._id, isDeleted: false }),
      Conversation.countDocuments({ tenantId: tenant._id }),
    ]);
    return ok(res, {
      tenant: tenant.toJSON(),
      profile,
      users,
      subscription,
      stats: { leads, conversations },
    });
  }),
);

router.put(
  '/:id',
  validate(
    z.object({
      name: z.string().min(2).max(160).optional(),
      industry: z.enum(['coaching', 'healthcare', 'hotels', 'real_estate', 'salon', 'other']).optional(),
      contactEmail: z.string().email().optional().or(z.literal('')),
      contactPhone: z.string().max(24).optional(),
      planCode: z.string().max(40).optional(),
      timezone: z.string().max(60).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) throw ApiError.notFound('Business not found');

    Object.assign(tenant, req.body);
    await tenant.save();

    if (req.body.planCode) {
      await Subscription.updateOne(
        { tenantId: tenant._id },
        { $set: { planCode: req.body.planCode } },
        { upsert: true },
      );
    }
    if (req.body.name) {
      await BusinessProfile.updateOne({ tenantId: tenant._id }, { $set: { name: req.body.name } });
    }

    await audit(req, {
      action: 'tenant.updated',
      entity: 'Tenant',
      entityId: tenant._id,
      tenantId: tenant._id,
      meta: req.body,
    });
    return ok(res, { tenant: tenant.toJSON() });
  }),
);

router.patch(
  '/:id/status',
  validate(z.object({ status: z.enum(['active', 'suspended', 'inactive']), reason: z.string().max(300).optional() })),
  asyncHandler(async (req, res) => {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) throw ApiError.notFound('Business not found');

    tenant.status = req.body.status;
    tenant.suspendedReason = req.body.status === 'active' ? null : req.body.reason || null;
    await tenant.save();

    await audit(req, {
      action: `tenant.${req.body.status}`,
      entity: 'Tenant',
      entityId: tenant._id,
      tenantId: tenant._id,
      severity: req.body.status === 'active' ? 'info' : 'warning',
      meta: { reason: req.body.reason },
    });

    return ok(res, { tenant: tenant.toJSON() });
  }),
);

export default router;
