import rateLimit from 'express-rate-limit';

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

export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: envelope('Webhook rate limit exceeded.'),
});
