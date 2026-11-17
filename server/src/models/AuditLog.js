import mongoose from 'mongoose';
import { schemaOptions } from './base.js';

const auditLogSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorRole: { type: String, default: null },
    action: { type: String, required: true, index: true },
    entity: { type: String, default: null },
    entityId: { type: String, default: null },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },
    meta: { type: mongoose.Schema.Types.Mixed, default: undefined },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  schemaOptions,
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ tenantId: 1, createdAt: -1 });

export default mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
