import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const ISSUER = 'unique-ai-frontdesk';

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      role: user.role,
      tenantId: user.tenantId ? String(user.tenantId) : null,
    },
    env.accessSecret,
    { expiresIn: env.accessTtl, issuer: ISSUER },
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.accessSecret, { issuer: ISSUER });
}

export function createRefreshTokenValue() {
  return crypto.randomBytes(48).toString('hex');
}

export function hashToken(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function refreshExpiry(days = env.refreshDays) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export const REFRESH_COOKIE = 'uaf_refresh';

export function refreshCookieOptions(expires) {
  return {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'lax',
    path: '/api/auth',
    expires,
  };
}
