import mongoose from 'mongoose';
import { schemaOptions } from './base.js';

const usageLogSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    kind: { type: String, enum: ['ai', 'voice', 'whatsapp', 'storage'], required: true, index: true },
    quantity: { type: Number, default: 1 },
    unit: { type: String, default: 'request' },
    channel: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  schemaOptions,
);

usageLogSchema.index({ tenantId: 1, kind: 1, createdAt: -1 });

export default mongoose.models.UsageLog || mongoose.model('UsageLog', usageLogSchema);
