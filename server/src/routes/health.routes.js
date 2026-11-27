import { Router } from 'express';
import { connectDB, dbState } from '../config/db.js';
import { env } from '../config/env.js';
import { ok } from '../utils/response.js';

const router = Router();

router.get('/', async (_req, res) => {
  // On a cold serverless instance no route has opened the pool yet, so probe
  // once and report the real state instead of a misleading "disconnected".
  if (dbState() === 'disconnected') await connectDB().catch(() => {});
  const state = dbState();
  return ok(res, {
    status: state === 'connected' ? 'ok' : 'degraded',
    db: state,
    dbConfigured: Boolean(env.mongoUri),
    aiConfigured: Boolean(env.openaiKey),
    environment: env.nodeEnv,
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

export default router;
