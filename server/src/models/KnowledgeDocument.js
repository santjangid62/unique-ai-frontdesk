import mongoose from 'mongoose';
import { schemaOptions } from './base.js';

const knowledgeDocumentSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    filename: { type: String, required: true },
    mimetype: { type: String, default: 'text/plain' },
    size: { type: Number, default: 0 },
    status: { type: String, enum: ['processing', 'ready', 'failed'], default: 'processing', index: true },
    extractedText: { type: String, default: '' },
    entriesCreated: { type: Number, default: 0 },
    error: { type: String, default: null },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  schemaOptions,
);

export default mongoose.models.KnowledgeDocument ||
  mongoose.model('KnowledgeDocument', knowledgeDocumentSchema);
