import mongoose from 'mongoose';
import { schemaOptions } from './base.js';

export const APPOINTMENT_STATUSES = [
  'scheduled',
  'confirmed',
  'completed',
  'cancelled',
  'rescheduled',
  'no_show',
];
export const ACTIVE_APPOINTMENT_STATUSES = ['scheduled', 'confirmed'];

const appointmentSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, required: true, trim: true },
    customerPhone: { type: String, default: '' },
    customerEmail: { type: String, default: '' },
    type: { type: String, enum: ['demo', 'counselling', 'admission', 'general'], default: 'demo' },
    course: { type: String, default: '' },
    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, required: true },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    status: {
      type: String,
      enum: APPOINTMENT_STATUSES,
      default: 'scheduled',
      index: true,
    },
    notes: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    channel: { type: String, default: 'manual' },
    reminderSentAt: { type: Date, default: null },
    rescheduledFrom: { type: Date, default: null },
  },
  schemaOptions,
);

appointmentSchema.index({ tenantId: 1, startAt: 1, status: 1 });
appointmentSchema.index({ tenantId: 1, staffId: 1, startAt: 1 });

export default mongoose.models.Appointment || mongoose.model('Appointment', appointmentSchema);
