import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { schemaOptions } from './base.js';

export const ROLES = ['super_admin', 'business_admin', 'staff'];

const loginEntry = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    success: { type: Boolean, default: true },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, index: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
    phone: { type: String, trim: true, default: '' },
    designation: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    emailVerified: { type: Boolean, default: false },
    // One-time email verification code (hashed), cleared after success.
    verificationCodeHash: { type: String, default: null, select: false },
    verificationExpiresAt: { type: Date, default: null, select: false },
    verificationSentAt: { type: Date, default: null, select: false },
    verificationAttempts: { type: Number, default: 0, select: false },
    lastLoginAt: { type: Date, default: null },
    loginHistory: { type: [loginEntry], default: [] },
    passwordChangedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  schemaOptions,
);

userSchema.index({ tenantId: 1, role: 1, isActive: 1 });

userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, 12);
  this.passwordChangedAt = new Date();
};

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.passwordHash || '');
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: String(this._id),
    name: this.name,
    email: this.email,
    role: this.role,
    tenantId: this.tenantId ? String(this.tenantId) : null,
    phone: this.phone,
    designation: this.designation,
    isActive: this.isActive,
    emailVerified: this.emailVerified,
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
  };
};

export default mongoose.models.User || mongoose.model('User', userSchema);
