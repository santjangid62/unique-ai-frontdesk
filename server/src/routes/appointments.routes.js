import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok, paginated, parsePaging } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { requireTenantUser, resolveTenantId, tenantScopeGuard } from '../middleware/rbac.js';
import { audit } from '../utils/audit.js';
import { addMinutes, startOfDay, endOfDay } from '../utils/date.js';
import { bookAppointment, checkAvailability } from '../services/booking.js';
import Appointment, { APPOINTMENT_STATUSES, ACTIVE_APPOINTMENT_STATUSES } from '../models/Appointment.js';
import BusinessProfile from '../models/BusinessProfile.js';
import Lead from '../models/Lead.js';

const router = Router();
router.use(authenticate, tenantScopeGuard, requireTenantUser);

const appointmentBody = z.object({
  customerName: z.string().min(2).max(160),
  customerPhone: z.string().max(24).optional().default(''),
  customerEmail: z.string().max(160).optional().default(''),
  type: z.enum(['demo', 'counselling', 'admission', 'general']).default('demo'),
  course: z.string().max(160).optional().default(''),
  startAt: z.coerce.date(),
  durationMinutes: z.coerce.number().min(15).max(240).optional().default(45),
  staffId: z.string().length(24).nullable().optional(),
  leadId: z.string().length(24).nullable().optional(),
  customerId: z.string().length(24).nullable().optional(),
  notes: z.string().max(1000).optional().default(''),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const { page, limit, skip } = parsePaging(req.query, { page: 1, limit: 50, maxLimit: 200 });
    const filter = { tenantId };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.staffId) filter.staffId = req.query.staffId;
    if (req.user.role === 'staff' && req.query.mine !== 'false') filter.staffId = req.user.id;
    if (req.query.from || req.query.to) {
      filter.startAt = {};
      if (req.query.from) filter.startAt.$gte = startOfDay(new Date(req.query.from));
      if (req.query.to) filter.startAt.$lte = endOfDay(new Date(req.query.to));
    }
    if (req.query.upcoming === 'true') {
      filter.startAt = { ...(filter.startAt || {}), $gte: new Date() };
      filter.status = { $in: ACTIVE_APPOINTMENT_STATUSES };
    }

    const [items, total] = await Promise.all([
      Appointment.find(filter)
        .populate('staffId', 'name email')
        .populate('leadId', 'name phone status')
        .sort({ startAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Appointment.countDocuments(filter),
    ]);
    return paginated(res, items.map((item) => ({ ...item, id: String(item._id) })), { page, limit, total });
  }),
);

/** Slot grid for a day, marking booked staff slots. */
router.get(
  '/availability',
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const dateText = String(req.query.date || new Date().toISOString().slice(0, 10));
    const day = startOfDay(new Date(`${dateText}T00:00:00`));
    const profile = await BusinessProfile.findOne({ tenantId }).lean();

    const [openHour, openMinute] = String(profile?.openingTime || '09:00').split(':').map(Number);
    const [closeHour, closeMinute] = String(profile?.closingTime || '19:00').split(':').map(Number);
    const open = new Date(day);
    open.setHours(openHour || 9, openMinute || 0, 0, 0);
    const close = new Date(day);
    close.setHours(closeHour || 19, closeMinute || 0, 0, 0);

    const booked = await Appointment.find({
      tenantId,
      status: { $in: ACTIVE_APPOINTMENT_STATUSES },
      startAt: { $gte: day, $lte: endOfDay(day) },
      ...(req.query.staffId ? { staffId: req.query.staffId } : {}),
    })
      .select('startAt endAt staffId')
      .lean();

    const slots = [];
    let cursor = open;
    while (cursor < close) {
      const end = addMinutes(cursor, 45);
      if (end > close) break;
      const taken = booked.some((item) => item.startAt < end && item.endAt > cursor);
      slots.push({ startAt: new Date(cursor), endAt: end, available: !taken && cursor.getTime() > Date.now() });
      cursor = addMinutes(cursor, 30);
    }

    return ok(res, { date: dateText, workingDays: profile?.workingDays || [], slots });
  }),
);

router.post(
  '/',
  validate(appointmentBody),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const payload = { ...req.body };
    if (req.user.role === 'staff') payload.staffId = req.user.id;

    const appointment = await bookAppointment({ tenantId, payload, actor: req.user, channel: 'manual' });

    if (appointment.leadId) {
      await Lead.updateOne({ _id: appointment.leadId, tenantId }, { $set: { status: 'demo_scheduled' } });
    }
    await audit(req, {
      action: 'appointment.created',
      entity: 'Appointment',
      entityId: appointment._id,
      meta: { startAt: appointment.startAt, type: appointment.type },
    });
    return created(res, appointment.toJSON());
  }),
);

router.put(
  '/:id',
  validate(appointmentBody.partial()),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const appointment = await Appointment.findOne({ _id: req.params.id, tenantId });
    if (!appointment) throw ApiError.notFound('Appointment not found');
    if (req.user.role === 'staff' && String(appointment.staffId) !== String(req.user.id)) {
      throw ApiError.forbidden('This appointment is not assigned to you');
    }

    const nextStart = req.body.startAt ? new Date(req.body.startAt) : appointment.startAt;
    const durationMinutes = req.body.durationMinutes || Math.round((appointment.endAt - appointment.startAt) / 60000);
    const nextEnd = addMinutes(nextStart, durationMinutes);

    if (req.body.startAt) {
      const availability = await checkAvailability({
        tenantId,
        startAt: nextStart,
        endAt: nextEnd,
        staffId: req.body.staffId ?? appointment.staffId,
        phone: appointment.customerPhone,
      });
      if (!availability.available) {
        throw new ApiError(409, availability.reason, availability, 'SLOT_UNAVAILABLE');
      }
      appointment.rescheduledFrom = appointment.startAt;
    }

    const { startAt, durationMinutes: _ignored, ...rest } = req.body;
    Object.assign(appointment, rest);
    appointment.startAt = nextStart;
    appointment.endAt = nextEnd;
    if (req.body.startAt && appointment.status !== 'completed') appointment.status = 'rescheduled';
    await appointment.save();

    await audit(req, { action: 'appointment.updated', entity: 'Appointment', entityId: appointment._id });
    return ok(res, appointment.toJSON());
  }),
);

router.patch(
  '/:id/status',
  validate(z.object({ status: z.enum(APPOINTMENT_STATUSES), note: z.string().max(500).optional() })),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const appointment = await Appointment.findOne({ _id: req.params.id, tenantId });
    if (!appointment) throw ApiError.notFound('Appointment not found');
    if (req.user.role === 'staff' && String(appointment.staffId) !== String(req.user.id)) {
      throw ApiError.forbidden('This appointment is not assigned to you');
    }

    appointment.status = req.body.status;
    if (req.body.note) appointment.notes = `${appointment.notes ? `${appointment.notes}\n` : ''}${req.body.note}`;
    await appointment.save();

    if (appointment.leadId && req.body.status === 'completed') {
      await Lead.updateOne({ _id: appointment.leadId, tenantId }, { $set: { status: 'interested' } });
    }
    await audit(req, {
      action: 'appointment.status_changed',
      entity: 'Appointment',
      entityId: appointment._id,
      meta: { status: appointment.status },
    });
    return ok(res, appointment.toJSON());
  }),
);

export default router;
