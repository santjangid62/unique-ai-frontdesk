import mongoose from 'mongoose';
import { schemaOptions } from './base.js';

const messageSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    role: { type: String, enum: ['customer', 'ai', 'staff', 'system'], required: true },
    content: { type: String, required: true },
    authorName: { type: String, default: '' },
    sources: { type: [{ title: String, id: String }], default: [] },
    meta: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  schemaOptions,
);

messageSchema.index({ tenantId: 1, conversationId: 1, createdAt: 1 });

export default mongoose.models.Message || mongoose.model('Message', messageSchema);
