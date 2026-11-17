import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, paginated, parsePaging } from '../utils/response.js';
import { authenticate } from '../middleware/auth.js';
import { requireBusinessAdmin, requireSuperAdmin, resolveTenantId } from '../middleware/rbac.js';
import AuditLog from '../models/AuditLog.js';

const router = Router();
router.use(authenticate);

function buildFilter(req) {
  const filter = {};
  if (req.query.action) filter.action = { $regex: String(req.query.action), $options: 'i' };
  if (req.query.severity) filter.severity = req.query.severity;
  if (req.query.tenantId) filter.tenantId = req.query.tenantId;
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
  }
  return filter;
}

router.get(
  '/',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePaging(req.query, { page: 1, limit: 30, maxLimit: 200 });
    const filter = buildFilter(req);
    const [items, total] = await Promise.all([
      AuditLog.find(filter).populate('actorId', 'name email role').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);
    return paginated(res, items.map((item) => ({ ...item, id: String(item._id) })), { page, limit, total });
  }),
);

/** Tenant admins can review activity inside their own business only. */
router.get(
  '/tenant',
  requireBusinessAdmin,
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const { page, limit, skip } = parsePaging(req.query, { page: 1, limit: 30, maxLimit: 200 });
    const filter = { ...buildFilter(req), tenantId };
    filter.tenantId = tenantId;

    const [items, total] = await Promise.all([
      AuditLog.find(filter).populate('actorId', 'name email role').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);
    return ok(res, items.map((item) => ({ ...item, id: String(item._id) })), { page, limit, total });
  }),
);

export default router;
