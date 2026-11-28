import mongoose from 'mongoose';
import { schemaOptions } from './base.js';

export const TENANT_STATUSES = ['active', 'suspended', 'inactive'];
import { BUSINESS_INDUSTRIES } from '../services/businessCategories.js';

export const INDUSTRIES = BUSINESS_INDUSTRIES;

const tenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    industry: { type: String, enum: INDUSTRIES, default: 'coaching', index: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: TENANT_STATUSES, default: 'active', index: true },
    planCode: { type: String, default: 'starter', index: true },
    contactEmail: { type: String, lowercase: true, trim: true, default: '' },
    contactPhone: { type: String, trim: true, default: '' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    suspendedReason: { type: String, default: null },
    lastActiveAt: { type: Date, default: null },
  },
  schemaOptions,
);

tenantSchema.index({ status: 1, createdAt: -1 });

export default mongoose.models.Tenant || mongoose.model('Tenant', tenantSchema);
