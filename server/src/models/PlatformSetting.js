import mongoose from 'mongoose';
import { schemaOptions } from './base.js';

/** Platform-level key/value settings managed by the Super Admin. */
const platformSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
    description: { type: String, default: '' },
  },
  schemaOptions,
);

export default mongoose.models.PlatformSetting ||
  mongoose.model('PlatformSetting', platformSettingSchema);
