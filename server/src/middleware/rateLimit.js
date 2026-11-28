import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import {
  decrementWindow,
  incrementWindow,
  rateLimitKey,
  sharedRateLimitConfigured,
  sharedRateLimitReady,
} from '../services/sharedRateLimit.js';

const envelope = (message) => ({ success: false, error: { code: 'RATE_LIMITED', message } });

/**
 * Bucket for a request: the signed-in user when the access token was already
 * verified, otherwise the tenant, otherwise the caller's IP. Never a
 * client-supplied identifier.
 */
export function rateLimitIdentity(req) {
  const userId = req.user?.id || req.auth?.sub;
  if (userId) return `user:${userId}`;
  const tenantId = req.tenant?.id || req.tenant?._id || req.auth?.tenantId;
  if (tenantId) return `tenant:${tenantId}`;
  return `ip:${req.ip || 'unknown'}`;
}

const ipIdentity = (req) => `ip:${req.ip || 'unknown'}`;

/**
 * Splits a global limit across the expected instance count. Used only when the
 * shared store is configured but unavailable, so N instances do not each allow
 * the full limit and multiply the global cap.
 */
export function clampedLimit(limit, instances = env.rateLimitInstances) {
  const divisor = Math.max(1, Number(instances) || 1);
  return Math.max(1, Math.ceil(Number(limit) / divisor));
}

function memoryLimiter({ limit, windowMs, message, skipSuccessfulRequests = false, keyOf }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests,
    ...(keyOf ? { keyGenerator: (req) => keyOf(req) } : {}),
    message: envelope(message),
  });
}

/**
 * Uses the shared Upstash Redis counter when configured so every serverless
 * instance enforces one limit. Without configuration the full in-memory limit
 * applies (local development); when the store is configured but unavailable a
 * clamped in-memory limit applies instead, so the outage does not multiply the
 * global cap.
 */
function sharedLimiter({
  scope,
  limit,
  windowMs,
  message,
  skipSuccessful = false,
  keyOf = rateLimitIdentity,
  clampOnOutage = true,
}) {
  const normalFallback = memoryLimiter({ limit, windowMs, message, skipSuccessfulRequests: skipSuccessful, keyOf });
  const outageFallback = memoryLimiter({
    limit: clampOnOutage ? clampedLimit(limit) : limit,
    windowMs,
    message,
    skipSuccessfulRequests: skipSuccessful,
    keyOf,
  });

  return async (req, res, next) => {
    if (!sharedRateLimitConfigured()) return normalFallback(req, res, next);
    // While the shared store is paused after a failure, skip the network call
    // entirely instead of paying the timeout on every request.
    if (!sharedRateLimitReady()) return outageFallback(req, res, next);
    const key = rateLimitKey(scope, keyOf(req));
    try {
      const count = await incrementWindow({ key, windowMs });
      res.setHeader('RateLimit-Limit', limit);
      res.setHeader('RateLimit-Remaining', Math.max(0, limit - count));
      if (count > limit) return res.status(429).json(envelope(message));
      if (skipSuccessful) {
        res.on('finish', () => {
          if (res.statusCode < 400) decrementWindow({ key, windowMs }).catch(() => {});
        });
      }
      return next();
    } catch {
      return outageFallback(req, res, next);
    }
  };
}

export const authLimiter = sharedLimiter({
  scope: 'auth',
  limit: 30,
  windowMs: 15 * 60 * 1000,
  message: 'Too many authentication attempts. Please try again in a few minutes.',
  skipSuccessful: true,
  keyOf: ipIdentity,
});

export const apiLimiter = sharedLimiter({
  scope: 'api',
  limit: 1200,
  windowMs: 15 * 60 * 1000,
  message: 'Too many requests. Please slow down.',
});

export const chatLimiter = sharedLimiter({
  scope: 'chat',
  limit: 40,
  windowMs: 60 * 1000,
  message: 'Too many messages. Please wait a moment.',
});

export const whatsappVerifyLimiter = sharedLimiter({
  scope: 'whatsapp-verify',
  limit: 60,
  windowMs: 60 * 1000,
  message: 'Too many webhook verification attempts.',
  keyOf: ipIdentity,
});

export const webhookLimiter = sharedLimiter({
  scope: 'whatsapp-webhook',
  limit: 300,
  windowMs: 60 * 1000,
  message: 'Webhook rate limit exceeded.',
  keyOf: ipIdentity,
});
