import rateLimit from 'express-rate-limit';
import {
  decrementWindow,
  incrementWindow,
  rateLimitKey,
  sharedRateLimitReady,
} from '../services/sharedRateLimit.js';

const envelope = (message) => ({ success: false, error: { code: 'RATE_LIMITED', message } });

/**
 * Uses the shared Upstash Redis counter when configured so every serverless
 * instance enforces one limit; otherwise the in-memory limiter keeps local
 * development and single-instance deployments working. If Redis is down the
 * request falls back to the in-memory limiter instead of failing closed.
 */
function sharedLimiter({ scope, fallback, limit, windowMs, message, skipSuccessful = false }) {
  return async (req, res, next) => {
    // While the shared store is paused after a failure, skip the network call
    // entirely instead of paying the timeout on every request.
    if (!sharedRateLimitReady()) return fallback(req, res, next);
    const key = rateLimitKey(scope, req.ip);
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
      return fallback(req, res, next);
    }
  };
}

export const authLimiter = sharedLimiter({
  scope: 'auth',
  fallback: rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: envelope('Too many authentication attempts. Please try again in a few minutes.'),
  }),
  limit: 30,
  windowMs: 15 * 60 * 1000,
  message: 'Too many authentication attempts. Please try again in a few minutes.',
  skipSuccessful: true,
});

export const apiLimiter = sharedLimiter({
  scope: 'api',
  fallback: rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 1200,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: envelope('Too many requests. Please slow down.'),
  }),
  limit: 1200,
  windowMs: 15 * 60 * 1000,
  message: 'Too many requests. Please slow down.',
});

export const chatLimiter = sharedLimiter({
  scope: 'chat',
  fallback: rateLimit({
    windowMs: 60 * 1000,
    limit: 40,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: envelope('Too many messages. Please wait a moment.'),
  }),
  limit: 40,
  windowMs: 60 * 1000,
  message: 'Too many messages. Please wait a moment.',
});

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
