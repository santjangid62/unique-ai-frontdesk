import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { hashToken } from '../utils/tokens.js';
import { env } from '../config/env.js';
import { issueSession, readRefreshToken, revokeAllForUser, revokeSession } from '../services/session.js';
import { uniqueSlug } from '../utils/slug.js';
import User from '../models/User.js';
import Tenant from '../models/Tenant.js';
import Plan from '../models/Plan.js';
import Subscription from '../models/Subscription.js';
import BusinessProfile from '../models/BusinessProfile.js';
import AiAgent from '../models/AiAgent.js';
import KnowledgeEntry from '../models/KnowledgeEntry.js';
import RefreshToken from '../models/RefreshToken.js';
import PasswordReset from '../models/PasswordReset.js';
import { notifyUser } from '../services/notifications.js';
import { ensureDefaultPlans } from '../services/plans.js';
import { sendPasswordResetEmail, sendVerificationEmail } from '../services/email.js';
import { indianPhoneSchema, optionalIndianPhoneSchema } from '../utils/phone.js';

const router = Router();

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

const registerSchema = z.object({
  businessName: z.string().min(2).max(160),
  ownerName: z.string().min(2).max(120),
  email: z.string().email().transform((value) => value.toLowerCase().trim()),
  password: passwordSchema,
  phone: indianPhoneSchema,
  industry: z.enum(['coaching', 'healthcare', 'hotels', 'real_estate', 'salon', 'other']).default('coaching'),
  timezone: z.string().max(60).optional().default('Asia/Kolkata'),
});

const loginSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase().trim()),
  password: z.string().min(1).max(200),
  // Separate sign-in portals: a business admin cannot sign in from the staff
  // portal (or any other combination).
  portal: z.enum(['business', 'staff', 'super-admin']).optional(),
});

const PORTAL_ROLES = { business: 'business_admin', staff: 'staff', 'super-admin': 'super_admin' };
const PORTAL_LABELS = { business: 'business admin', staff: 'staff', 'super-admin': 'super admin' };

const VERIFICATION_TTL_MS = 15 * 60 * 1000;
const VERIFICATION_RESEND_MS = 60 * 1000;

const newVerificationCode = () => String(crypto.randomInt(100000, 1000000));

/** Stores a fresh 6-digit code on the user and emails it. */
async function issueVerificationCode(user, { businessName = '' } = {}) {
  const code = newVerificationCode();
  user.verificationCodeHash = hashToken(code);
  user.verificationExpiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
  user.verificationSentAt = new Date();
  user.verificationAttempts = 0;
  await user.save();

  const delivery = await sendVerificationEmail({
    to: user.email,
    name: user.name,
    businessName: businessName || user.name,
    code,
  });
  return { code, delivered: delivery.delivered };
}

router.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { businessName, ownerName, email, password, phone, industry, timezone } = req.body;

    const existing = await User.findOne({ email }).select('_id').lean();
    if (existing) throw ApiError.conflict('An account with this email already exists');

    const slug = await uniqueSlug(Tenant, businessName);
    const tenant = await Tenant.create({
      name: businessName,
      slug,
      industry,
      contactEmail: email,
      contactPhone: phone,
      timezone,
      status: 'active',
      planCode: 'starter',
    });

    const user = new User({ name: ownerName, email, role: 'business_admin', tenantId: tenant._id, phone });
    await user.setPassword(password);
    await user.save();

    tenant.ownerId = user._id;
    await tenant.save();

    await BusinessProfile.create({
      tenantId: tenant._id,
      name: businessName,
      industry,
      phone,
      email,
      timezone,
      languages: ['English', 'Hindi'],
    });

    await ensureDefaultPlans();
    const plan = await Plan.findOne({ code: 'starter' }).lean();
    await Subscription.create({
      tenantId: tenant._id,
      planCode: 'starter',
      status: 'trialing',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 14 * 86400000),
      usage: { staff: 1 },
    });

    await AiAgent.create({
      tenantId: tenant._id,
      name: `${businessName} Frontdesk AI`,
      greeting: `Namaste! Welcome to ${businessName}. How can I help you today?`,
      isDefault: true,
      instructions:
        'Be warm and concise. Help with course information, fees, batch timings and demo class bookings.',
      channels: { website: true, whatsapp: false, voice: false },
    });

    await KnowledgeEntry.create({
      tenantId: tenant._id,
      category: 'business',
      title: 'Business overview',
      content: `${businessName} is a ${industry.replace('_', ' ')} business. Contact: ${phone || email}. Use the Settings page to add courses, fees, timings and FAQs so the AI can answer accurately.`,
      tags: ['about', 'contact'],
    });

    await notifyUser({
      userId: user._id,
      tenantId: tenant._id,
      type: 'system',
      title: 'Verify your business email',
      body: `We sent a 6-digit verification code to ${email}. Verify it to activate your workspace.`,
      link: `/verify-email?email=${encodeURIComponent(email)}`,
    });

    const verification = await issueVerificationCode(user, { businessName });

    await audit(req, {
      action: 'auth.register_business',
      entity: 'Tenant',
      entityId: tenant._id,
      tenantId: tenant._id,
      actorId: user._id,
      actorRole: user.role,
      meta: { planLimit: plan?.code || 'starter', verificationSent: verification.delivered },
    });

    // No session yet: the owner must verify the email address first.
    return created(res, {
      requiresEmailVerification: true,
      email,
      verificationSent: verification.delivered,
      ...(env.isProd ? {} : { devCode: verification.code }),
    });
  }),
);

router.post(
  '/verify-email',
  authLimiter,
  validate(
    z.object({
      email: z.string().email().transform((value) => value.toLowerCase().trim()),
      code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your email'),
    }),
  ),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email }).select(
      '+verificationCodeHash +verificationExpiresAt +verificationAttempts',
    );
    if (!user) throw ApiError.badRequest('This verification request is invalid or has expired');
    if (user.emailVerified) throw ApiError.badRequest('This email is already verified. Please sign in.');

    if (!user.verificationCodeHash || !user.verificationExpiresAt || user.verificationExpiresAt < new Date()) {
      throw ApiError.badRequest('This code has expired. Request a new verification code.');
    }
    if (user.verificationAttempts >= 6) {
      throw ApiError.badRequest('Too many incorrect attempts. Request a new verification code.');
    }

    if (hashToken(req.body.code) !== user.verificationCodeHash) {
      user.verificationAttempts += 1;
      await user.save();
      throw ApiError.badRequest('That verification code is incorrect');
    }

    user.emailVerified = true;
    user.verificationCodeHash = null;
    user.verificationExpiresAt = null;
    user.verificationAttempts = 0;
    await user.save();

    let tenant = null;
    if (user.role !== 'super_admin') {
      tenant = await Tenant.findById(user.tenantId).select('name slug status industry planCode');
      if (!tenant) throw ApiError.forbidden('Business account not found');
      if (tenant.status !== 'active') {
        throw ApiError.forbidden(`Business account is ${tenant.status}. Please contact support.`);
      }
    }

    await notifyUser({
      userId: user._id,
      tenantId: user.tenantId,
      type: 'system',
      title: 'Welcome to Unique AI Frontdesk',
      body: 'Your email is verified. Add your courses and FAQs, then test your AI receptionist.',
      link: '/app/knowledge',
    });

    const tokens = await issueSession(res, user, req);
    await audit(req, {
      action: 'auth.email_verified',
      entity: 'User',
      entityId: user._id,
      tenantId: user.tenantId,
      actorId: user._id,
      actorRole: user.role,
    });

    return ok(res, { user: user.toSafeJSON(), tenant: tenant ? tenant.toJSON() : null, ...tokens });
  }),
);

router.post(
  '/resend-verification',
  authLimiter,
  validate(z.object({ email: z.string().email().transform((value) => value.toLowerCase().trim()) })),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email }).select('+verificationSentAt');
    if (!user || user.emailVerified) {
      return ok(res, { message: 'If the account needs verification, a new code has been sent.' });
    }
    if (user.verificationSentAt && Date.now() - user.verificationSentAt.getTime() < VERIFICATION_RESEND_MS) {
      throw ApiError.tooMany('Please wait a minute before requesting another code');
    }

    const tenant = user.tenantId ? await Tenant.findById(user.tenantId).select('name').lean() : null;
    const verification = await issueVerificationCode(user, { businessName: tenant?.name || '' });
    return ok(res, {
      message: 'A new verification code has been sent to your email.',
      ...(env.isProd ? {} : { devCode: verification.code }),
    });
  }),
);

router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password, portal } = req.body;
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) throw ApiError.unauthorized('Invalid email or password');

    const valid = await user.comparePassword(password);
    if (!valid) {
      await User.updateOne(
        { _id: user._id },
        { $push: { loginHistory: { $each: [{ success: false, ip: req.ip }], $slice: -20 } } },
      );
      throw ApiError.unauthorized('Invalid email or password');
    }
    if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');

    if (portal && PORTAL_ROLES[portal] !== user.role) {
      const homePortal = user.role === 'business_admin' ? 'business' : user.role === 'staff' ? 'staff' : 'super-admin';
      throw new ApiError(
        403,
        `This account is not a ${PORTAL_LABELS[portal]} account. Use the ${PORTAL_LABELS[homePortal]} sign-in page.`,
        null,
        'WRONG_PORTAL',
      );
    }

    if (user.role !== 'super_admin' && !user.emailVerified) {
      await notifyUser({
        userId: user._id,
        tenantId: user.tenantId,
        type: 'system',
        title: 'Verify your business email first',
        body: 'Your sign-in is blocked until you verify the email address used at registration.',
        link: `/verify-email?email=${encodeURIComponent(user.email)}`,
      });
      throw new ApiError(
        403,
        'Please verify your business email before signing in. Use the 6-digit code we sent you at registration.',
        { email: user.email },
        'EMAIL_NOT_VERIFIED',
      );
    }

    let tenant = null;
    if (user.role !== 'super_admin') {
      tenant = await Tenant.findById(user.tenantId).select('name slug status industry planCode');
      if (!tenant) throw ApiError.forbidden('Business account not found');
      if (tenant.status !== 'active') {
        throw ApiError.forbidden(`Business account is ${tenant.status}. Please contact support.`);
      }
    }

    user.lastLoginAt = new Date();
    user.loginHistory = [...(user.loginHistory || []).slice(-19), { ip: req.ip, userAgent: req.get('user-agent'), success: true }];
    await user.save();

    const tokens = await issueSession(res, user, req);
    await audit(req, {
      action: 'auth.login',
      entity: 'User',
      entityId: user._id,
      tenantId: user.tenantId,
      actorId: user._id,
      actorRole: user.role,
    });

    return ok(res, { user: user.toSafeJSON(), tenant: tenant ? tenant.toJSON() : null, ...tokens });
  }),
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const tokenValue = readRefreshToken(req);
    if (!tokenValue) throw ApiError.unauthorized('Refresh token missing');

    const stored = await RefreshToken.findOne({ tokenHash: hashToken(tokenValue) });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw ApiError.unauthorized('Session expired, please sign in again');
    }

    const user = await User.findById(stored.userId);
    if (!user || !user.isActive) throw ApiError.unauthorized('Account is not active');

    if (user.role !== 'super_admin') {
      const tenant = await Tenant.findById(user.tenantId).select('status');
      if (!tenant || tenant.status !== 'active') throw ApiError.forbidden('Business account is not active');
    }

    stored.revokedAt = new Date();
    const tokens = await issueSession(res, user, req);
    stored.replacedByHash = hashToken(tokens.refreshToken);
    await stored.save();

    return ok(res, { user: user.toSafeJSON(), ...tokens });
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await revokeSession(res, readRefreshToken(req));
    return ok(res, { message: 'Signed out' });
  }),
);

router.post(
  '/forgot-password',
  authLimiter,
  validate(z.object({ email: z.string().email().transform((v) => v.toLowerCase().trim()) })),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email, isActive: true });
    let devToken = null;

    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      await PasswordReset.create({
        userId: user._id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        ip: req.ip,
      });
      devToken = rawToken;
      const resetUrl = `${env.appUrl.replace(/\/$/, '')}/reset-password?token=${rawToken}`;
      const delivery = await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });
      if (!delivery.delivered) {
        // Development fallback so the flow stays testable without an email key.
        console.info(`[auth] password reset requested for ${user.email}: ${rawToken}`);
      }
      await audit(req, {
        action: 'auth.password_reset_requested',
        entity: 'User',
        entityId: user._id,
        tenantId: user.tenantId,
        severity: 'warning',
      });
    }

    return ok(res, {
      message: 'If the email exists, a reset link has been generated.',
      ...(env.isProd ? {} : { resetToken: devToken }),
    });
  }),
);

router.post(
  '/reset-password',
  authLimiter,
  validate(z.object({ token: z.string().min(10), password: passwordSchema })),
  asyncHandler(async (req, res) => {
    const record = await PasswordReset.findOne({
      tokenHash: hashToken(req.body.token),
      usedAt: null,
      expiresAt: { $gt: new Date() },
    });
    if (!record) throw ApiError.badRequest('This reset link is invalid or has expired');

    const user = await User.findById(record.userId);
    if (!user) throw ApiError.badRequest('This reset link is invalid or has expired');

    await user.setPassword(req.body.password);
    await user.save();
    record.usedAt = new Date();
    await record.save();
    await revokeAllForUser(user._id);

    await audit(req, {
      action: 'auth.password_reset',
      entity: 'User',
      entityId: user._id,
      tenantId: user.tenantId,
      severity: 'warning',
    });

    return ok(res, { message: 'Password updated. Please sign in with your new password.' });
  }),
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) throw ApiError.unauthorized();
    return ok(res, { user: user.toSafeJSON(), tenant: req.tenant });
  }),
);

router.patch(
  '/me',
  authenticate,
  validate(
    z.object({
      name: z.string().min(2).max(120).optional(),
      phone: optionalIndianPhoneSchema,
      designation: z.string().max(80).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const user = await User.findByIdAndUpdate(req.user.id, { $set: req.body }, { new: true });
    return ok(res, { user: user.toSafeJSON() });
  }),
);

router.post(
  '/change-password',
  authenticate,
  validate(z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema })),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select('+passwordHash');
    const valid = await user.comparePassword(req.body.currentPassword);
    if (!valid) throw ApiError.badRequest('Current password is incorrect');
    await user.setPassword(req.body.newPassword);
    await user.save();
    await revokeAllForUser(user._id);
    await audit(req, { action: 'auth.password_changed', entity: 'User', entityId: user._id });
    return ok(res, { message: 'Password changed. Please sign in again.' });
  }),
);

/**
 * One-time Super Admin bootstrap. Disabled by default and never part of public
 * registration, as required by the PRD.
 */
router.post(
  '/bootstrap-super-admin',
  authLimiter,
  validate(
    z.object({
      name: z.string().min(2),
      email: z.string().email().transform((v) => v.toLowerCase().trim()),
      password: passwordSchema,
      setupKey: z.string().min(10),
    }),
  ),
  asyncHandler(async (req, res) => {
    if (!env.allowSuperAdminBootstrap) {
      throw ApiError.forbidden('Super admin bootstrap is disabled');
    }
    if (req.body.setupKey !== env.accessSecret) {
      throw ApiError.forbidden('Invalid setup key');
    }
    const existing = await User.findOne({ role: 'super_admin' }).select('_id').lean();
    if (existing) throw ApiError.conflict('A super admin already exists');

    const user = new User({ name: req.body.name, email: req.body.email, role: 'super_admin' });
    await user.setPassword(req.body.password);
    await user.save();
    await audit(req, { action: 'auth.bootstrap_super_admin', entity: 'User', entityId: user._id });
    return created(res, { user: user.toSafeJSON() });
  }),
);

export default router;
