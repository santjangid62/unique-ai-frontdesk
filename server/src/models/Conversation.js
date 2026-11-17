import mongoose from 'mongoose';
import { schemaOptions } from './base.js';

export const CHANNELS = ['voice', 'whatsapp', 'website'];

const conversationSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    channel: { type: String, enum: CHANNELS, default: 'website', index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, default: 'Website visitor' },
    customerPhone: { type: String, default: '' },
    visitorId: { type: String, default: '', index: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiAgent', default: null },
    subject: { type: String, default: '' },
    status: { type: String, enum: ['open', 'pending', 'handoff', 'closed'], default: 'open', index: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    aiEnabled: { type: Boolean, default: true },
    escalationReason: { type: String, default: null },
    escalatedAt: { type: Date, default: null },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastMessagePreview: { type: String, default: '' },
    messageCount: { type: Number, default: 0 },
    unreadForStaff: { type: Number, default: 0 },
  },
  schemaOptions,
);

conversationSchema.index({ tenantId: 1, status: 1, lastMessageAt: -1 });

export default mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);
