import mongoose from 'mongoose';
import { schemaOptions } from './base.js';

const automationRuleSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true },
    trigger: {
      type: String,
      enum: ['lead_created', 'appointment_created', 'appointment_reminder', 'no_reply_followup', 'handoff_created'],
      required: true,
    },
    action: {
      type: String,
      enum: ['notify_admin', 'notify_staff', 'send_whatsapp', 'send_email', 'create_followup'],
      required: true,
    },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    isActive: { type: Boolean, default: true },
  },
  schemaOptions,
);

export default mongoose.models.AutomationRule || mongoose.model('AutomationRule', automationRuleSchema);
