import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok, paginated, parsePaging } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole, requireTenantUser, resolveTenantId, tenantScopeGuard } from '../middleware/rbac.js';
import { audit } from '../utils/audit.js';
import { toCsv, sendCsv } from '../utils/csv.js';
import { upsertLead } from '../services/crm.js';
import Lead, { LEAD_SOURCES, LEAD_STATUSES } from '../models/Lead.js';
import User from '../models/User.js';
import Tenant from '../models/Tenant.js';
import { businessCategory } from '../services/businessCategories.js';
import Appointment from '../models/Appointment.js';
import Conversation from '../models/Conversation.js';

const router = Router();
router.use(authenticate, tenantScopeGuard, requireTenantUser);

const leadBody = z.object({
  name: z.string().min(2).max(160),
  phone: z.string().max(24).optional().default(''),
  email: z.string().max(160).optional().default(''),
  course: z.string().max(160).optional().default(''),
  source: z.enum(LEAD_SOURCES).optional().default('manual'),
  status: z.enum(LEAD_STATUSES).optional().default('new'),
  assigneeId: z.string().length(24).nullable().optional(),
  followUpDate: z.coerce.date().nullable().optional(),
  notes: z.string().max(2000).optional(),
});

/** Staff can only see and touch leads assigned to them. */
function scopedFilter(req, tenantId) {
  const filter = { tenantId, isDeleted: false };
  if (req.user.role === 'staff') filter.assigneeId = req.user.id;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.source) filter.source = req.query.source;
  if (req.query.assigneeId) filter.assigneeId = req.query.assigneeId;
  if (req.query.course) filter.course = { $regex: String(req.query.course).trim(), $options: 'i' };
  if (req.query.search) {
    const term = String(req.query.search).trim();
    filter.$or = [
      { name: { $regex: term, $options: 'i' } },
      { phone: { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } },
      { course: { $regex: term, $options: 'i' } },
    ];
  }
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
  }
  return filter;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const { page, limit, skip } = parsePaging(req.query);
    const filter = scopedFilter(req, tenantId);

    const [items, total, statusCounts] = await Promise.all([
      Lead.find(filter)
        .populate('assigneeId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Lead.countDocuments(filter),
      Lead.aggregate([{ $match: { tenantId, isDeleted: false } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);

    return ok(
      res,
      items.map((item) => ({ ...item, id: String(item._id) })),
      {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        statusCounts: Object.fromEntries(statusCounts.map((row) => [row._id, row.count])),
      },
    );
  }),
);

router.post(
  '/',
  validate(leadBody),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const { notes, ...data } = req.body;
    if (req.user.role === 'staff') data.assigneeId = req.user.id;

    const { lead, duplicate } = await upsertLead({
      tenantId,
      data: { ...data, note: notes },
      source: data.source || 'manual',
      actor: req.user,
      req,
    });

    return created(res, { lead: lead.toJSON(), duplicate });
  }),
);

router.get(
  '/export',
  requireRole('business_admin'),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const [tenant, leads] = await Promise.all([
      Tenant.findById(tenantId).select('industry').lean(),
      Lead.find({ ...scopedFilter(req, tenantId) })
        .populate('assigneeId', 'name')
        .limit(5000)
        .lean(),
    ]);

    const csv = toCsv(leads, [
      { label: 'Name', key: 'name' },
      { label: 'Phone', key: 'phone' },
      { label: 'Email', key: 'email' },
      { label: businessCategory(tenant?.industry).offering, key: 'course' },
      { label: 'Source', key: 'source' },
      { label: 'Status', key: 'status' },
      { label: 'Assignee', value: (row) => row.assigneeId?.name || '' },
      { label: 'Follow up', value: (row) => (row.followUpDate ? new Date(row.followUpDate).toISOString().slice(0, 10) : '') },
      { label: 'Created', value: (row) => new Date(row.createdAt).toISOString() },
    ]);

    await audit(req, { action: 'lead.exported', entity: 'Lead', meta: { count: leads.length } });
    return sendCsv(res, `leads-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const filter = { _id: req.params.id, tenantId, isDeleted: false };
    if (req.user.role === 'staff') filter.assigneeId = req.user.id;

    const lead = await Lead.findOne(filter).populate('assigneeId', 'name email').lean();
    if (!lead) throw ApiError.notFound('Lead not found');

    const [appointments, conversations] = await Promise.all([
      Appointment.find({ tenantId, leadId: lead._id }).sort({ startAt: -1 }).limit(10).lean(),
      Conversation.find({ tenantId, customerPhone: lead.phone }).sort({ lastMessageAt: -1 }).limit(10).lean(),
    ]);

    return ok(res, { lead: { ...lead, id: String(lead._id) }, appointments, conversations });
  }),
);

router.put(
  '/:id',
  validate(leadBody.partial()),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const filter = { _id: req.params.id, tenantId, isDeleted: false };
    if (req.user.role === 'staff') filter.assigneeId = req.user.id;

    const lead = await Lead.findOne(filter);
    if (!lead) throw ApiError.notFound('Lead not found');

    const { notes, ...rest } = req.body;
    if (rest.assigneeId === '') rest.assigneeId = null;
    Object.assign(lead, rest);
    if (notes) lead.notes.push({ text: notes, by: req.user.id, byName: req.user.name });
    await lead.save();

    await audit(req, { action: 'lead.updated', entity: 'Lead', entityId: lead._id, meta: { fields: Object.keys(rest) } });
    return ok(res, lead.toJSON());
  }),
);

router.patch(
  '/:id/status',
  validate(z.object({ status: z.enum(LEAD_STATUSES), note: z.string().max(500).optional() })),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const filter = { _id: req.params.id, tenantId, isDeleted: false };
    if (req.user.role === 'staff') filter.assigneeId = req.user.id;

    const lead = await Lead.findOne(filter);
    if (!lead) throw ApiError.notFound('Lead not found');

    const changed = lead.status !== req.body.status;
    lead.status = req.body.status;
    lead.lastContactAt = new Date();
    if (changed) {
      lead.notes.push({
        text: `Status changed to ${req.body.status}${req.body.note ? ` - ${req.body.note}` : ''}`,
        by: req.user.id,
        byName: req.user.name,
      });
    }
    await lead.save();
    await audit(req, { action: 'lead.status_changed', entity: 'Lead', entityId: lead._id, meta: { status: lead.status } });
    return ok(res, lead.toJSON());
  }),
);

router.post(
  '/:id/assign',
  requireRole('business_admin'),
  validate(z.object({ assigneeId: z.string().length(24).nullable() })),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (req.body.assigneeId) {
      const assignee = await User.findOne({ _id: req.body.assigneeId, tenantId, isActive: true }).select('_id').lean();
      if (!assignee) throw ApiError.badRequest('Assignee must be an active team member');
    }
    const lead = await Lead.findOneAndUpdate(
      { _id: req.params.id, tenantId, isDeleted: false },
      { $set: { assigneeId: req.body.assigneeId }, $push: { notes: { text: 'Lead reassigned', byName: req.user.name, by: req.user.id } } },
      { new: true },
    );
    if (!lead) throw ApiError.notFound('Lead not found');
    await audit(req, { action: 'lead.assigned', entity: 'Lead', entityId: lead._id, meta: { assigneeId: req.body.assigneeId } });
    return ok(res, lead.toJSON());
  }),
);

router.post(
  '/:id/notes',
  validate(z.object({ text: z.string().min(1).max(2000) })),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const filter = { _id: req.params.id, tenantId, isDeleted: false };
    if (req.user.role === 'staff') filter.assigneeId = req.user.id;

    const lead = await Lead.findOneAndUpdate(
      filter,
      { $push: { notes: { text: req.body.text, by: req.user.id, byName: req.user.name } } },
      { new: true },
    );
    if (!lead) throw ApiError.notFound('Lead not found');
    return ok(res, lead.toJSON());
  }),
);

router.delete(
  '/:id',
  requireRole('business_admin'),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const lead = await Lead.findOneAndUpdate(
      { _id: req.params.id, tenantId, isDeleted: false },
      { $set: { isDeleted: true } },
      { new: true },
    );
    if (!lead) throw ApiError.notFound('Lead not found');
    await audit(req, { action: 'lead.deleted', entity: 'Lead', entityId: lead._id, severity: 'warning' });
    return ok(res, { message: 'Lead deleted' });
  }),
);

export default router;
