import mongoose from 'mongoose';
import { schemaOptions } from './base.js';

export const LEAD_SOURCES = ['voice', 'whatsapp', 'website', 'manual', 'integration'];
export const LEAD_STATUSES = [
  'new',
  'contacted',
  'interested',
  'demo_scheduled',
  'converted',
  'not_interested',
  'lost',
];

const noteSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    byName: { type: String, default: 'System' },
  },
  { _id: false },
);

const leadSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    phone: { type: String, trim: true, default: '', index: true },
    email: { type: String, lowercase: true, trim: true, default: '' },
    course: { type: String, trim: true, default: '' },
    source: { type: String, enum: LEAD_SOURCES, default: 'manual', index: true },
    status: { type: String, enum: LEAD_STATUSES, default: 'new', index: true },
    assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    notes: { type: [noteSchema], default: [] },
    followUpDate: { type: Date, default: null },
    lastContactAt: { type: Date, default: null },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', default: null },
    score: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  schemaOptions,
);

leadSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
leadSchema.index(
  { tenantId: 1, phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: 'string', $gt: '' }, isDeleted: false } },
);

export default mongoose.models.Lead || mongoose.model('Lead', leadSchema);
