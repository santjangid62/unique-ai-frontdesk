import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok, paginated, parsePaging } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { requireTenantUser, resolveTenantId, tenantScopeGuard } from '../middleware/rbac.js';
import { audit } from '../utils/audit.js';
import { normalizePhone } from '../services/crm.js';
import Customer from '../models/Customer.js';
import Conversation from '../models/Conversation.js';
import Call from '../models/Call.js';
import Appointment from '../models/Appointment.js';

const router = Router();
router.use(authenticate, tenantScopeGuard, requireTenantUser);

const customerBody = z.object({
  name: z.string().min(2).max(160),
  phone: z.string().max(24).optional().default(''),
  email: z.string().max(160).optional().default(''),
  tags: z.array(z.string().max(40)).optional().default([]),
  interestedCourses: z.array(z.string().max(160)).optional().default([]),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const { page, limit, skip } = parsePaging(req.query);
    const filter = { tenantId, isDeleted: false };
    if (req.query.search) {
      const term = String(req.query.search).trim();
      filter.$or = [
        { name: { $regex: term, $options: 'i' } },
        { phone: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } },
      ];
    }
    if (req.query.tag) filter.tags = req.query.tag;

    const [items, total] = await Promise.all([
      Customer.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Customer.countDocuments(filter),
    ]);
    return paginated(res, items.map((item) => ({ ...item, id: String(item._id) })), { page, limit, total });
  }),
);

router.post(
  '/',
  validate(customerBody),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const phone = normalizePhone(req.body.phone);
    if (phone) {
      const existing = await Customer.findOne({ tenantId, phone, isDeleted: false }).lean();
      if (existing) throw ApiError.conflict('A customer with this phone number already exists', { id: existing._id });
    }
    const customer = await Customer.create({ ...req.body, phone, tenantId });
    await audit(req, { action: 'customer.created', entity: 'Customer', entityId: customer._id });
    return created(res, customer.toJSON());
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const customer = await Customer.findOne({ _id: req.params.id, tenantId, isDeleted: false }).lean();
    if (!customer) throw ApiError.notFound('Customer not found');

    const [conversations, calls, appointments] = await Promise.all([
      Conversation.find({ tenantId, $or: [{ customerId: customer._id }, { customerPhone: customer.phone }] })
        .sort({ lastMessageAt: -1 })
        .limit(20)
        .lean(),
      Call.find({ tenantId, from: customer.phone }).sort({ startedAt: -1 }).limit(20).lean(),
      Appointment.find({ tenantId, $or: [{ customerId: customer._id }, { customerPhone: customer.phone }] })
        .sort({ startAt: -1 })
        .limit(20)
        .lean(),
    ]);

    return ok(res, { customer: { ...customer, id: String(customer._id) }, conversations, calls, appointments });
  }),
);

router.put(
  '/:id',
  validate(
    z.object({
      name: z.string().min(2).max(160).optional(),
      phone: z.string().max(24).optional(),
      email: z.string().max(160).optional(),
      tags: z.array(z.string().max(40)).optional(),
      interestedCourses: z.array(z.string().max(160)).optional(),
      note: z.string().max(1000).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const { note, ...rest } = req.body;
    if (rest.phone) rest.phone = normalizePhone(rest.phone);
    const update = { $set: rest };
    if (note) update.$push = { notes: note };

    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, tenantId, isDeleted: false },
      update,
      { new: true },
    );
    if (!customer) throw ApiError.notFound('Customer not found');
    await audit(req, { action: 'customer.updated', entity: 'Customer', entityId: customer._id });
    return ok(res, customer.toJSON());
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (req.user.role !== 'business_admin') throw ApiError.forbidden('Only a business admin can delete customers');
    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, tenantId, isDeleted: false },
      { $set: { isDeleted: true } },
      { new: true },
    );
    if (!customer) throw ApiError.notFound('Customer not found');
    await audit(req, { action: 'customer.deleted', entity: 'Customer', entityId: customer._id, severity: 'warning' });
    return ok(res, { message: 'Customer deleted' });
  }),
);

export default router;
