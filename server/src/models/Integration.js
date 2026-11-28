import mongoose from 'mongoose';
import { schemaOptions } from './base.js';

const integrationSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    provider: {
      type: String,
      enum: ['whatsapp', 'twilio', 'openai', 'email', 'sms', 'n8n'],
      required: true,
    },
    status: { type: String, enum: ['connected', 'disconnected', 'error'], default: 'disconnected' },
    label: { type: String, default: '' },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    externalId: { type: String, default: '' },
    lastCheckedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
  },
  schemaOptions,
);

integrationSchema.index({ tenantId: 1, provider: 1 }, { unique: true });
// Lets the WhatsApp verification handshake find a tenant by token directly.
integrationSchema.index({ provider: 1, 'config.verifyToken': 1 });

export default mongoose.models.Integration || mongoose.model('Integration', integrationSchema);
