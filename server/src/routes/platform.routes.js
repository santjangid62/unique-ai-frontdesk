import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, paginated, parsePaging } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { requireSuperAdmin } from '../middleware/rbac.js';
import { audit } from '../utils/audit.js';
import User from '../models/User.js';
import Tenant from '../models/Tenant.js';
import PlatformSetting from '../models/PlatformSetting.js';

const router = Router();
router.use(authenticate, requireSuperAdmin);

/** All users across every tenant, for platform-level user management. */
router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePaging(req.query);
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.status === 'active') filter.isActive = true;
    if (req.query.status === 'inactive') filter.isActive = false;
    if (req.query.search) {
      const term = String(req.query.search).trim();
      filter.$or = [
        { name: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter).populate('tenantId', 'name slug').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);

    return paginated(
      res,
      users.map((user) => ({
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        tenant: user.tenantId ? { id: String(user.tenantId._id), name: user.tenantId.name, slug: user.tenantId.slug } : null,
      })),
      { page, limit, total },
    );
  }),
);

router.patch(
  '/users/:id/status',
  validate(z.object({ isActive: z.boolean() })),
  asyncHandler(async (req, res) => {
    if (String(req.params.id) === String(req.user.id)) {
      throw ApiError.badRequest('You cannot change your own account status');
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive: req.body.isActive } },
      { new: true },
    );
    if (!user) throw ApiError.notFound('User not found');
    await audit(req, {
      action: req.body.isActive ? 'platform.user_activated' : 'platform.user_deactivated',
      entity: 'User',
      entityId: user._id,
      severity: 'warning',
      meta: { email: user.email },
    });
    return ok(res, { user: user.toSafeJSON() });
  }),
);

router.get(
  '/tenants',
  asyncHandler(async (_req, res) => {
    const tenants = await Tenant.find().select('name slug status planCode').sort({ name: 1 }).lean();
    return ok(res, tenants.map((tenant) => ({ ...tenant, id: String(tenant._id) })));
  }),
);

router.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    const settings = await PlatformSetting.find().lean();
    return ok(
      res,
      Object.fromEntries(settings.map((setting) => [setting.key, setting.value])),
    );
  }),
);

router.put(
  '/settings',
  validate(z.object({ key: z.string().min(2).max(60), value: z.any() })),
  asyncHandler(async (req, res) => {
    const setting = await PlatformSetting.findOneAndUpdate(
      { key: req.body.key },
      { $set: { value: req.body.value } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    await audit(req, {
      action: 'platform.setting_updated',
      entity: 'PlatformSetting',
      entityId: setting._id,
      meta: { key: setting.key },
    });
    return ok(res, setting.toJSON());
  }),
);

export default router;
