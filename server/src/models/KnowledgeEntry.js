import mongoose from 'mongoose';
import { schemaOptions } from './base.js';

export const KNOWLEDGE_CATEGORIES = ['business', 'course', 'fee', 'faq', 'policy', 'timing', 'contact', 'other'];

const knowledgeEntrySchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    category: { type: String, enum: KNOWLEDGE_CATEGORIES, default: 'faq', index: true },
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    tags: { type: [String], default: [] },
    isEnabled: { type: Boolean, default: true, index: true },
    source: { type: String, enum: ['manual', 'document', 'website'], default: 'manual' },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'KnowledgeDocument', default: null },
    version: { type: Number, default: 1 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  schemaOptions,
);

knowledgeEntrySchema.index({ tenantId: 1, category: 1, isEnabled: 1 });
knowledgeEntrySchema.index({ tenantId: 1, title: 1, content: 1 });

export default mongoose.models.KnowledgeEntry || mongoose.model('KnowledgeEntry', knowledgeEntrySchema);
