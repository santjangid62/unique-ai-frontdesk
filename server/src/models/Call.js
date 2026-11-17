import mongoose from 'mongoose';
import { schemaOptions } from './base.js';

const transcriptLine = new mongoose.Schema(
  {
    role: { type: String, enum: ['customer', 'ai', 'staff'], default: 'customer' },
    text: { type: String, default: '' },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const callSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    provider: { type: String, default: 'twilio' },
    providerCallId: { type: String, default: '', index: true },
    direction: { type: String, enum: ['inbound', 'outbound'], default: 'inbound' },
    from: { type: String, default: '' },
    to: { type: String, default: '' },
    status: {
      type: String,
      enum: ['ringing', 'in_progress', 'completed', 'missed', 'failed', 'transferred'],
      default: 'ringing',
      index: true,
    },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    durationSeconds: { type: Number, default: 0 },
    transcript: { type: [transcriptLine], default: [] },
    summary: { type: String, default: '' },
    recordingUrl: { type: String, default: null },
    consentGiven: { type: Boolean, default: false },
    transferredTo: { type: String, default: null },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
    handledByAi: { type: Boolean, default: true },
  },
  schemaOptions,
);

callSchema.index({ tenantId: 1, startedAt: -1 });
callSchema.index({ tenantId: 1, status: 1 });

export default mongoose.models.Call || mongoose.model('Call', callSchema);
