import rateLimit from 'express-rate-limit';
import { incrementWindow, rateLimitKey, sharedRateLimitConfigured } from '../services/sharedRateLimit.js';

const envelope = (message) => ({ success: false, error: { code: 'RATE_LIMITED', message } });

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: envelope('Too many authentication attempts. Please try again in a few minutes.'),
});

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: envelope('Too many requests. Please slow down.'),
});

export const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: envelope('Too many messages. Please wait a moment.'),
});

/**
 * Uses the shared Upstash Redis counter when configured so every serverless
 * instance enforces one limit; otherwise the in-memory limiter keeps local
 * development and single-instance deployments working. If Redis is down the
 * request falls back to the in-memory limiter instead of failing closed.
 */
function sharedLimiter({ scope, fallback, limit, windowMs, message }) {
  return async (req, res, next) => {
    if (!sharedRateLimitConfigured()) return fallback(req, res, next);
    try {
      const key = rateLimitKey(scope, req.ip);
      const count = await incrementWindow({ key, windowMs });
      res.setHeader('RateLimit-Limit', limit);
      res.setHeader('RateLimit-Remaining', Math.max(0, limit - count));
      if (count > limit) return res.status(429).json(envelope(message));
      return next();
    } catch (error) {
      console.warn('[rate-limit] shared store unavailable, using memory store:', error.message);
      return fallback(req, res, next);
    }
  };
}

export const whatsappVerifyLimiter = sharedLimiter({
  scope: 'whatsapp-verify',
  fallback: rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: envelope('Too many webhook verification attempts.'),
  }),
  limit: 60,
  windowMs: 60 * 1000,
  message: 'Too many webhook verification attempts.',
});

export const webhookLimiter = sharedLimiter({
  scope: 'whatsapp-webhook',
  fallback: rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: envelope('Webhook rate limit exceeded.'),
  }),
  limit: 300,
  windowMs: 60 * 1000,
  message: 'Webhook rate limit exceeded.',
});
