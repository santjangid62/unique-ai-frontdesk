import mongoose from 'mongoose';
import { schemaOptions } from './base.js';

const courseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, default: '' },
    fee: { type: Number, default: 0 },
    duration: { type: String, default: '' },
    batchTimings: { type: [String], default: [] },
    mode: { type: String, enum: ['online', 'offline', 'hybrid'], default: 'offline' },
    syllabus: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { _id: true },
);

const businessProfileSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      unique: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    logoUrl: { type: String, default: '' },
    description: { type: String, default: '', maxlength: 4000 },
    industry: { type: String, default: 'coaching' },
    website: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    country: { type: String, default: 'India' },
    mapUrl: { type: String, default: '' },
    workingDays: { type: [String], default: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] },
    openingTime: { type: String, default: '09:00' },
    closingTime: { type: String, default: '19:00' },
    holidays: {
      type: [{ date: String, label: String }],
      default: [],
    },
    timezone: { type: String, default: 'Asia/Kolkata' },
    languages: { type: [String], default: ['English', 'Hindi'] },
    widget: {
      primaryColor: { type: String, default: '#4f46e5' },
      position: { type: String, enum: ['right', 'left'], default: 'right' },
      welcomeMessage: { type: String, default: 'Hi! How can we help you today?' },
      welcomeMessageHi: { type: String, default: '' },
      showBranding: { type: Boolean, default: true },
      isEnabled: { type: Boolean, default: true },
    },
    coaching: {
      courses: { type: [courseSchema], default: [] },
      demoAvailable: { type: Boolean, default: true },
      admissionProcess: { type: String, default: '' },
      placementInfo: { type: String, default: '' },
      faculty: { type: [String], default: [] },
    },
  },
  schemaOptions,
);

export default mongoose.models.BusinessProfile || mongoose.model('BusinessProfile', businessProfileSchema);
