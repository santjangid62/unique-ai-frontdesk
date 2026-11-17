import mongoose from 'mongoose';
import { schemaOptions } from './base.js';

const agentSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    greeting: { type: String, default: 'Hello! How can I help you today?' },
    personality: { type: String, default: 'Warm, helpful and concise' },
    tone: { type: String, enum: ['friendly', 'professional', 'enthusiastic'], default: 'friendly' },
    language: { type: String, default: 'English' },
    voice: { type: String, default: 'female-neutral' },
    instructions: { type: String, default: '', maxlength: 8000 },
    workingHours: {
      start: { type: String, default: '09:00' },
      end: { type: String, default: '19:00' },
      days: { type: [String], default: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] },
    },
    channels: {
      website: { type: Boolean, default: true },
      whatsapp: { type: Boolean, default: false },
      voice: { type: Boolean, default: false },
    },
    handoff: {
      enabled: { type: Boolean, default: true },
      triggers: { type: [String], default: ['customer_request', 'low_confidence', 'complaint', 'complex_query'] },
      transferNumber: { type: String, default: '' },
    },
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
  },
  schemaOptions,
);

agentSchema.index({ tenantId: 1, isDefault: 1 });

export default mongoose.models.AiAgent || mongoose.model('AiAgent', agentSchema);
