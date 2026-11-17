import mongoose from 'mongoose';
import { schemaOptions } from './base.js';

const planSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    priceMonthly: { type: Number, required: true, min: 0, default: 0 },
    priceYearly: { type: Number, min: 0, default: 0 },
    currency: { type: String, default: 'INR' },
    limits: {
      agents: { type: Number, default: 1 },
      staff: { type: Number, default: 3 },
      knowledgeEntries: { type: Number, default: 100 },
      aiMessagesPerMonth: { type: Number, default: 1000 },
      voiceMinutesPerMonth: { type: Number, default: 0 },
      whatsappMessagesPerMonth: { type: Number, default: 0 },
    },
    features: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  schemaOptions,
);

export default mongoose.models.Plan || mongoose.model('Plan', planSchema);
