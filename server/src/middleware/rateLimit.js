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
  return `ip:${normalizeIpAddress(req.ip)}`;
}

/**
 * Expands an IPv6 address to its eight hextets so it can be truncated safely.
 * Compressed forms (``::``) are padded with zeroes.
 */
function expandIpv6(address) {
  const [left, right] = address.split('::');
  const leftParts = left ? left.split(':') : [];
  const rightParts = right ? right.split(':') : [];
  const missing = Math.max(0, 8 - leftParts.length - rightParts.length);
  return [...leftParts, ...Array(missing).fill('0'), ...rightParts];
}

/**
 * Normalises a caller IP for use as a rate-limit key. IPv4 stays intact;
 * IPv6 collapses to its /64 prefix so rotating addresses inside one subnet
 * cannot bypass a limit.
 */
export function normalizeIpAddress(ip) {
  const raw = String(ip || '').split('%')[0].trim();
  if (!raw) return 'unknown';
  const mapped = raw.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return mapped[1];
  if (!raw.includes(':')) return raw;
  const parts = expandIpv6(raw.toLowerCase()).map((part) => part.replace(/^0+$/, '0'));
  return `${parts.slice(0, 4).join(':')}::/64`;
}

const ipIdentity = (req) => `ip:${normalizeIpAddress(req.ip)}`;

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
        // A response handler may be frozen on serverless right after the
        // response is sent, so compensate before flushing instead of in
        // res.on('finish').
        const originalEnd = res.end.bind(res);
        let finishing = false;
        res.end = (chunk, encoding, callback) => {
          if (finishing) return res;
          finishing = true;
          if (res.statusCode >= 400) return originalEnd(chunk, encoding, callback);
          decrementWindow({ key, windowMs })
            .catch(() => {})
            .finally(() => originalEnd(chunk, encoding, callback));
          return res;
        };
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
