import { Router } from 'express';
import { dbState } from '../config/db.js';
import { env } from '../config/env.js';
import { ok } from '../utils/response.js';

const router = Router();

router.get('/', (_req, res) => {
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
