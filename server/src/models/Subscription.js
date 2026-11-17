import mongoose from 'mongoose';
import { schemaOptions } from './base.js';

export const SUBSCRIPTION_STATUSES = ['trialing', 'active', 'past_due', 'canceled', 'expired'];
export const USAGE_KEYS = ['aiMessages', 'voiceMinutes', 'whatsappMessages', 'knowledgeEntries', 'staff'];

const invoiceSchema = new mongoose.Schema(
  {
    number: { type: String, required: true },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: ['paid', 'pending', 'failed'], default: 'paid' },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    issuedAt: { type: Date, default: Date.now },
    paidAt: { type: Date, default: null },
    provider: { type: String, default: 'manual' },
    providerRef: { type: String, default: null },
  },
  { _id: true },
);

const subscriptionSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true, index: true },
    planCode: { type: String, required: true, default: 'starter' },
    status: { type: String, enum: SUBSCRIPTION_STATUSES, default: 'trialing', index: true },
    currentPeriodStart: { type: Date, default: Date.now },
    currentPeriodEnd: { type: Date, default: () => new Date(Date.now() + 30 * 86400000) },
    graceEndsAt: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    usage: {
      aiMessages: { type: Number, default: 0 },
      voiceMinutes: { type: Number, default: 0 },
      whatsappMessages: { type: Number, default: 0 },
      knowledgeEntries: { type: Number, default: 0 },
      staff: { type: Number, default: 0 },
    },
    invoices: { type: [invoiceSchema], default: [] },
  },
  schemaOptions,
);

export default mongoose.models.Subscription || mongoose.model('Subscription', subscriptionSchema);
