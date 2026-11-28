import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { requireTenantUser, resolveTenantId, tenantScopeGuard } from '../middleware/rbac.js';
import { audit } from '../utils/audit.js';
import BusinessProfile from '../models/BusinessProfile.js';
import Tenant from '../models/Tenant.js';
import { BUSINESS_INDUSTRIES } from '../services/businessCategories.js';

const router = Router();
router.use(authenticate, tenantScopeGuard, requireTenantUser);

const courseSchema = z.object({
  name: z.string().min(1).max(160),
  category: z.string().max(80).optional().default(''),
  fee: z.coerce.number().min(0).max(10_000_000).optional().default(0),
  duration: z.string().max(80).optional().default(''),
  batchTimings: z.array(z.string().max(40)).optional().default([]),
  mode: z.enum(['online', 'offline', 'hybrid']).optional().default('offline'),
  syllabus: z.string().max(4000).optional().default(''),
  isActive: z.boolean().optional().default(true),
  _id: z.string().optional(),
});

const offeringSchema = z.object({
  name: z.string().min(1).max(160),
  category: z.string().max(80).optional().default(''),
  price: z.coerce.number().min(0).max(100_000_000).optional().default(0),
  duration: z.string().max(80).optional().default(''),
  schedule: z.array(z.string().max(60)).optional().default([]),
  mode: z.enum(['online', 'offline', 'hybrid', 'na']).optional().default('na'),
  details: z.string().max(4000).optional().default(''),
  isActive: z.boolean().optional().default(true),
  _id: z.string().optional(),
});

const profileSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  logoUrl: z.string().max(500).optional().default(''),
  description: z.string().max(4000).optional().default(''),
  industry: z.enum(BUSINESS_INDUSTRIES).optional(),
  offerings: z.array(offeringSchema).optional(),
  website: z.string().max(200).optional().default(''),
  phone: z.string().max(24).optional().default(''),
  email: z.string().max(160).optional().default(''),
  address: z.string().max(300).optional().default(''),
  city: z.string().max(80).optional().default(''),
  state: z.string().max(80).optional().default(''),
  country: z.string().max(80).optional().default('India'),
  mapUrl: z.string().max(500).optional().default(''),
  workingDays: z.array(z.string().max(6)).optional().default(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']),
  openingTime: z.string().max(5).optional().default('09:00'),
  closingTime: z.string().max(5).optional().default('19:00'),
  timezone: z.string().max(60).optional(),
  languages: z.array(z.string().max(40)).optional().default(['English', 'Hindi']),
  holidays: z
    .array(z.object({ date: z.string().max(10), label: z.string().max(80).optional().default('') }))
    .optional()
    .default([]),
  widget: z
    .object({
      primaryColor: z.string().max(20).optional(),
      position: z.enum(['right', 'left']).optional(),
      welcomeMessage: z.string().max(300).optional(),
      welcomeMessageHi: z.string().max(300).optional(),
      showBranding: z.boolean().optional(),
      isEnabled: z.boolean().optional(),
    })
    .optional(),
  coaching: z
    .object({
      courses: z.array(courseSchema).optional().default([]),
      demoAvailable: z.boolean().optional().default(true),
      admissionProcess: z.string().max(2000).optional().default(''),
      placementInfo: z.string().max(2000).optional().default(''),
      faculty: z.array(z.string().max(120)).optional().default([]),
    })
    .optional(),
});

router.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    let profile = await BusinessProfile.findOne({ tenantId });
    if (!profile) {
      const tenant = await Tenant.findById(tenantId).lean();
      if (!tenant) throw ApiError.notFound('Business not found');
      profile = await BusinessProfile.create({ tenantId, name: tenant.name, industry: tenant.industry });
    }
    return ok(res, profile.toJSON());
  }),
);

router.put(
  '/profile',
  validate(profileSchema),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (req.user.role !== 'business_admin') {
      throw ApiError.forbidden('Only a business admin can update the profile');
    }
    const profile = await BusinessProfile.findOneAndUpdate(
      { tenantId },
      { $set: req.body },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    const tenantUpdate = {};
    if (req.body.name) tenantUpdate.name = req.body.name;
    if (req.body.industry) tenantUpdate.industry = req.body.industry;
    if (Object.keys(tenantUpdate).length) {
      await Tenant.updateOne({ _id: tenantId }, { $set: tenantUpdate });
    }
    await audit(req, {
      action: 'business.profile_updated',
      entity: 'BusinessProfile',
      entityId: profile._id,
      meta: { fields: Object.keys(req.body) },
    });
    return ok(res, profile.toJSON());
  }),
);

export default router;
