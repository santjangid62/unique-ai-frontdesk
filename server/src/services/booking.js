import { ApiError } from '../utils/ApiError.js';
import Appointment, { ACTIVE_APPOINTMENT_STATUSES } from '../models/Appointment.js';
import Lead from '../models/Lead.js';
import Customer from '../models/Customer.js';
import BusinessProfile from '../models/BusinessProfile.js';
import { addMinutes } from '../utils/date.js';
import { notifyTenantAdmins } from './notifications.js';

const DAY_CODES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function minutesOf(time) {
  const [h, m] = String(time || '00:00').split(':').map(Number);
  return (Number.isNaN(h) ? 0 : h) * 60 + (Number.isNaN(m) ? 0 : m);
}

/**
 * Checks tenant rules and existing bookings. Returns conflicts so the caller
 * can offer an alternative slot instead of failing blindly.
 */
export async function checkAvailability({ tenantId, startAt, endAt, staffId = null, phone = '' }) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const profile = await BusinessProfile.findOne({ tenantId }).lean();

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw ApiError.badRequest('Invalid appointment time');
  }
  if (end <= start) throw ApiError.badRequest('End time must be after start time');
  if (start.getTime() < Date.now() - 60 * 1000) {
    return { available: false, reason: 'Appointment time is in the past' };
  }

  if (profile) {
    const day = DAY_CODES[start.getDay()];
    if (profile.workingDays?.length && !profile.workingDays.includes(day)) {
      return { available: false, reason: `The business is closed on ${day}` };
    }
    const open = minutesOf(profile.openingTime);
    const close = minutesOf(profile.closingTime);
    const slotStart = start.getHours() * 60 + start.getMinutes();
    const slotEnd = end.getHours() * 60 + end.getMinutes();
    if (close > open && (slotStart < open || slotEnd > close)) {
      return {
        available: false,
        reason: `Appointments are only available between ${profile.openingTime} and ${profile.closingTime}`,
      };
    }
    const holiday = (profile.holidays || []).find((item) => item.date === start.toISOString().slice(0, 10));
    if (holiday) return { available: false, reason: `Closed for ${holiday.label || 'holiday'}` };
  }

  const baseConflict = {
    tenantId,
    status: { $in: ACTIVE_APPOINTMENT_STATUSES },
    startAt: { $lt: end },
    endAt: { $gt: start },
  };

  const conflicts = [];
  if (staffId) {
    const staffConflict = await Appointment.findOne({ ...baseConflict, staffId }).lean();
    if (staffConflict) conflicts.push({ type: 'staff', appointment: staffConflict });
  }
  if (phone) {
    const customerConflict = await Appointment.findOne({ ...baseConflict, customerPhone: phone }).lean();
    if (customerConflict) conflicts.push({ type: 'customer', appointment: customerConflict });
  }

  if (conflicts.length) {
    const nextFree = await suggestNextSlot({ tenantId, startAt: start, staffId, phone });
    return {
      available: false,
      reason: 'This slot is already booked',
      conflicts,
      suggestion: nextFree,
    };
  }

  return { available: true, startAt: start, endAt: end };
}

/** Finds the next free 30 minute slot within the next 7 days. */
export async function suggestNextSlot({ tenantId, startAt, staffId = null, phone = '', durationMinutes = 45 }) {
  let cursor = new Date(startAt);
  for (let i = 0; i < 7 * 16; i += 1) {
    cursor = addMinutes(cursor, i === 0 ? 30 : 30);
    const end = addMinutes(cursor, durationMinutes);
    const conflict = await Appointment.findOne({
      tenantId,
      status: { $in: ACTIVE_APPOINTMENT_STATUSES },
      startAt: { $lt: end },
      endAt: { $gt: cursor },
      ...(staffId ? { staffId } : {}),
      ...(phone ? { customerPhone: phone } : {}),
    }).lean();
    if (!conflict) return { startAt: cursor, endAt: end };
  }
  return null;
}

/** Atomically books an appointment after validation. */
export async function bookAppointment({ tenantId, payload, actor = null, channel = 'manual' }) {
  const durationMinutes = Number(payload.durationMinutes) > 0 ? Number(payload.durationMinutes) : 45;
  const startAt = new Date(payload.startAt);
  const endAt = payload.endAt ? new Date(payload.endAt) : addMinutes(startAt, durationMinutes);

  const availability = await checkAvailability({
    tenantId,
    startAt,
    endAt,
    staffId: payload.staffId || null,
    phone: payload.customerPhone || '',
  });
  if (!availability.available) {
    throw new ApiError(409, availability.reason, availability, 'SLOT_UNAVAILABLE');
  }

  const appointment = await Appointment.create({
    tenantId,
    leadId: payload.leadId || null,
    customerId: payload.customerId || null,
    customerName: payload.customerName,
    customerPhone: payload.customerPhone || '',
    customerEmail: payload.customerEmail || '',
    type: payload.type || 'demo',
    course: payload.course || '',
    startAt,
    endAt,
    staffId: payload.staffId || null,
    status: payload.status || 'scheduled',
    notes: payload.notes || '',
    createdBy: actor?.id || null,
    channel,
  });

  if (payload.leadId) {
    await Lead.updateOne({ _id: payload.leadId, tenantId }, { $set: { status: 'demo_scheduled' } });
  }
  if (payload.customerId) {
    await Customer.updateOne({ _id: payload.customerId, tenantId }, { $inc: { totalAppointments: 1 } });
  }

  await notifyTenantAdmins(tenantId, {
    type: 'appointment',
    title: 'New appointment booked',
    body: `${appointment.customerName} · ${appointment.type} · ${startAt.toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })}`,
    link: '/app/appointments',
  });

  return appointment;
}

export default bookAppointment;
