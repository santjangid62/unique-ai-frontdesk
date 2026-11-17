import mongoose from 'mongoose';
import { schemaOptions } from './base.js';

const customerSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: '', index: true },
    email: { type: String, lowercase: true, trim: true, default: '' },
    tags: { type: [String], default: [] },
    notes: { type: [String], default: [] },
    interestedCourses: { type: [String], default: [] },
    source: { type: String, default: 'manual' },
    totalConversations: { type: Number, default: 0 },
    totalAppointments: { type: Number, default: 0 },
    lastInteractionAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
  },
  schemaOptions,
);

customerSchema.index({ tenantId: 1, createdAt: -1 });
customerSchema.index(
  { tenantId: 1, phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: 'string', $gt: '' }, isDeleted: false } },
);

export default mongoose.models.Customer || mongoose.model('Customer', customerSchema);
