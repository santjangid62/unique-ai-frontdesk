import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import fs from 'node:fs';
import path from 'node:path';
import { env, allowedOrigins, assertProdConfig } from './config/env.js';
import { connectDB } from './config/db.js';
import { verifyAccessToken } from './utils/tokens.js';
import { ApiError } from './utils/ApiError.js';
import { errorHandler, notFound } from './middleware/error.js';
import { apiLimiter } from './middleware/rateLimit.js';

import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import tenantRoutes from './routes/tenants.routes.js';
import userRoutes from './routes/users.routes.js';
import businessRoutes from './routes/business.routes.js';
import agentRoutes from './routes/agents.routes.js';
import knowledgeRoutes from './routes/knowledge.routes.js';
import leadRoutes from './routes/leads.routes.js';
import customerRoutes from './routes/customers.routes.js';
import appointmentRoutes from './routes/appointments.routes.js';
import conversationRoutes, { callsRouter } from './routes/conversations.routes.js';
import publicRoutes from './routes/public.routes.js';
import voiceRoutes from './routes/voice.routes.js';
import whatsappRoutes from './routes/whatsapp.routes.js';
import planRoutes, { subscriptionRouter } from './routes/plans.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import notificationRoutes from './routes/notifications.routes.js';
import auditRoutes from './routes/audit.routes.js';
import integrationRoutes from './routes/integrations.routes.js';
import platformRoutes from './routes/platform.routes.js';

// Fail fast in production (including on serverless) when secrets or the
// database are missing, instead of silently running with development defaults.
assertProdConfig();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

/**
 * Explicit CORS: only the configured client origins and the request's own
 * origin are allowed. Credentials stay limited to those origins.
 */
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const selfOrigin = `${req.protocol}://${req.get('host')}`;
  const trusted = allowedOrigins();
  if (origin && (trusted.includes(origin) || origin === selfOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Tenant-Id');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  return next();
});

app.use(express.json({ limit: '2mb', verify: (req, _res, buffer) => { req.rawBody = buffer; } }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

if (!env.isProd) app.use(morgan('dev'));

/**
 * Verifies an optional bearer token before rate limiting so authenticated
 * requests are counted per user instead of per IP. Invalid tokens are left for
 * the route's authenticate middleware to reject.
 */
app.use('/api', (req, _res, next) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    try {
      req.auth = verifyAccessToken(header.slice(7).trim());
    } catch {
      req.auth = null;
    }
  }
  next();
});

app.use('/api', apiLimiter);

/** Health is served even when the database is unavailable. */
app.use('/api/health', healthRoutes);

/** Every other API route needs the database. */
app.use('/api', async (req, _res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    if (error.code === 'DB_NOT_CONFIGURED') return next(error);
    return next(ApiError.serviceUnavailable('Database connection failed. Please try again.'));
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/users', userRoutes);
app.use('/api/business', businessRoutes);
app.use('/api/ai-agents', agentRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/calls', callsRouter);
app.use('/api/voice', voiceRoutes);
app.use('/api/webhooks/whatsapp', whatsappRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/subscriptions', subscriptionRouter);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/platform', platformRoutes);

app.use('/api', notFound);

/** Optional static hosting of the built client (local production preview). */
const clientDist = path.resolve(process.cwd(), 'client', 'dist');
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist, { maxAge: '1h', index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
} else {
  app.get('/', (_req, res) =>
    res.json({
      success: true,
      data: {
        name: 'Unique AI Frontdesk API',
        message: 'API is running. Start the client with npm run dev:client.',
        health: '/api/health',
      },
    }),
  );
  app.use(notFound);
}

app.use(errorHandler);

export default app;
