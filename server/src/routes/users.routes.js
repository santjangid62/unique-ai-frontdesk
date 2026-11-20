import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok, paginated, parsePaging } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { requireBusinessAdmin, requireTenantUser, resolveTenantId, tenantScopeGuard } from '../middleware/rbac.js';
import { audit } from '../utils/audit.js';
import User from '../models/User.js';
import Plan from '../models/Plan.js';
import Subscription from '../models/Subscription.js';
import Lead from '../models/Lead.js';
import { optionalIndianPhoneSchema } from '../utils/phone.js';

const router = Router();
router.use(authenticate, tenantScopeGuard, requireTenantUser);

const staffBody = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  password: z.string().min(8).max(128),
  phone: optionalIndianPhoneSchema,
  designation: z.string().max(80).optional().default(''),
  role: z.enum(['business_admin', 'staff']).default('staff'),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const { page, limit, skip } = parsePaging(req.query);
    const filter = { tenantId };
    if (req.query.role) filter.role = req.query.role;
    if (req.query.search) {
      filter.$or = [
        { name: { $regex: String(req.query.search).trim(), $options: 'i' } },
        { email: { $regex: String(req.query.search).trim(), $options: 'i' } },
      ];
    }
    if (req.query.status === 'active') filter.isActive = true;
    if (req.query.status === 'inactive') filter.isActive = false;

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: 1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);

    const leadCounts = await Lead.aggregate([
      { $match: { tenantId: users[0]?.tenantId, isDeleted: false, assigneeId: { $ne: null } } },
      { $group: { _id: '$assigneeId', count: { $sum: 1 } } },
    ]);
    const counts = new Map(leadCounts.map((row) => [String(row._id), row.count]));

    return paginated(
      res,
      users.map((user) => ({
        ...user,
        id: String(user._id),
        assignedLeads: counts.get(String(user._id)) || 0,
      })),
      { page, limit, total },
    );
  }),
);

router.post(
  '/',
  requireBusinessAdmin,
  validate(staffBody),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const exists = await User.findOne({ email: req.body.email }).select('_id').lean();
    if (exists) throw ApiError.conflict('A user with this email already exists');

    const subscription = await Subscription.findOne({ tenantId }).lean();
    const plan = await Plan.findOne({ code: subscription?.planCode || 'starter' }).lean();
    const staffCount = await User.countDocuments({ tenantId, isActive: true });
    const seatLimit = plan?.limits?.staff ?? 3;
    if (staffCount >= seatLimit) {
      throw ApiError.forbidden(`Your ${plan?.name || 'current'} plan allows ${seatLimit} active users. Upgrade to add more.`);
    }

    const user = new User({ ...req.body, tenantId, createdBy: req.user.id, emailVerified: true });
    await user.setPassword(req.body.password);
    await user.save();
    await Subscription.updateOne({ tenantId }, { $inc: { 'usage.staff': 1 } });

    await audit(req, {
      action: 'user.created',
      entity: 'User',
      entityId: user._id,
      meta: { role: user.role, email: user.email },
    });

    return created(res, { user: user.toSafeJSON() });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const user = await User.findOne({ _id: req.params.id, tenantId }).lean();
    if (!user) throw ApiError.notFound('User not found');
    return ok(res, { user: { ...user, id: String(user._id) } });
  }),
);

router.put(
  '/:id',
  requireBusinessAdmin,
  validate(
    z.object({
      name: z.string().min(2).max(120).optional(),
      email: z.string().email().optional(),
      phone: optionalIndianPhoneSchema,
      designation: z.string().max(80).optional(),
      role: z.enum(['business_admin', 'staff']).optional(),
      isActive: z.boolean().optional(),
      password: z.string().min(8).max(128).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const user = await User.findOne({ _id: req.params.id, tenantId }).select('+passwordHash');
    if (!user) throw ApiError.notFound('User not found');
    if (String(user._id) === String(req.user.id) && req.body.isActive === false) {
      throw ApiError.badRequest('You cannot deactivate your own account');
    }

    const { password, ...rest } = req.body;
    Object.assign(user, rest);
    if (password) await user.setPassword(password);
    await user.save();

    await audit(req, {
      action: 'user.updated',
      entity: 'User',
      entityId: user._id,
      meta: { role: user.role, isActive: user.isActive },
    });
    return ok(res, { user: user.toSafeJSON() });
  }),
);

router.delete(
  '/:id',
  requireBusinessAdmin,
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (String(req.params.id) === String(req.user.id)) {
      throw ApiError.badRequest('You cannot remove your own account');
    }
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: { isActive: false } },
      { new: true },
    );
    if (!user) throw ApiError.notFound('User not found');

    await Lead.updateMany({ tenantId, assigneeId: user._id }, { $set: { assigneeId: null } });
    await audit(req, {
      action: 'user.deactivated',
      entity: 'User',
      entityId: user._id,
      severity: 'warning',
    });
    return ok(res, { message: 'User deactivated' });
  }),
);

/** Staff lookup list for assignment dropdowns. */
router.get(
  '/meta/assignable',
  requireBusinessAdmin,
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const users = await User.find({ tenantId, isActive: true })
      .select('name email role')
      .sort({ name: 1 })
      .lean();
    return ok(res, users);
  }),
);

export default router;
