import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { requireBusinessAdmin, requireTenantUser, resolveTenantId, tenantScopeGuard } from '../middleware/rbac.js';
import { audit } from '../utils/audit.js';
import Integration from '../models/Integration.js';
import { env } from '../config/env.js';
import { REQUIRED_FIELDS, checkIntegrationConnection } from '../services/integrationCheck.js';

const router = Router();
router.use(authenticate, tenantScopeGuard, requireTenantUser);

const PROVIDERS = ['whatsapp', 'twilio', 'openai', 'email', 'sms', 'n8n'];
const SECRET_KEYS = ['accessToken', 'authToken', 'apiKey', 'password', 'secret', 'verifyToken'];

function maskConfig(config = {}) {
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [
      key,
      SECRET_KEYS.some((secret) => key.toLowerCase().includes(secret.toLowerCase())) && value ? '••••••••' : value,
    ]),
  );
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const integrations = await Integration.find({ tenantId }).lean();
    const byProvider = new Map(integrations.map((item) => [item.provider, item]));

    const list = PROVIDERS.map((provider) => {
      const row = byProvider.get(provider);
      return {
        provider,
        status: row?.status || 'disconnected',
        label: row?.label || '',
        externalId: row?.externalId || '',
        config: maskConfig(row?.config || {}),
        lastCheckedAt: row?.lastCheckedAt || null,
        lastError: row?.lastError || null,
        requires: REQUIRED_FIELDS[provider] || [],
        platformConfigured: provider === 'openai' ? Boolean(env.openaiKey) : undefined,
      };
    });

    return ok(res, list);
  }),
);

router.put(
  '/:provider',
  requireBusinessAdmin,
  validate(
    z.object({
      status: z.enum(['connected', 'disconnected', 'error']).optional(),
      label: z.string().max(80).optional().default(''),
      externalId: z.string().max(120).optional().default(''),
      config: z.record(z.any()).optional().default({}),
    }),
  ),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const { provider } = req.params;
    if (!PROVIDERS.includes(provider)) throw ApiError.badRequest('Unknown provider');

    const existing = await Integration.findOne({ tenantId, provider }).lean();

    // Never overwrite a stored secret with the masked placeholder.
    const incoming = { ...(req.body.config || {}) };
    for (const key of Object.keys(incoming)) {
      if (incoming[key] === '••••••••' && existing?.config?.[key]) incoming[key] = existing.config[key];
    }

    const integration = await Integration.findOneAndUpdate(
      { tenantId, provider },
      {
        $set: {
          provider,
          status: req.body.status || 'connected',
          label: req.body.label || '',
          externalId: req.body.externalId || '',
          config: { ...(existing?.config || {}), ...incoming },
          lastCheckedAt: new Date(),
          lastError: null,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    await audit(req, {
      action: 'integration.updated',
      entity: 'Integration',
      entityId: integration._id,
      meta: { provider, status: integration.status },
    });

    return ok(res, {
      provider: integration.provider,
      status: integration.status,
      label: integration.label,
      externalId: integration.externalId,
      config: maskConfig(integration.config),
      lastCheckedAt: integration.lastCheckedAt,
    });
  }),
);

router.post(
  '/:provider/check',
  requireBusinessAdmin,
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const integration = await Integration.findOne({ tenantId, provider: req.params.provider });
    if (!integration) throw ApiError.notFound('Integration not configured');

    const result = await checkIntegrationConnection({
      provider: req.params.provider,
      config: integration.config || {},
      externalId: integration.externalId,
    });

    integration.status = result.ok ? 'connected' : 'error';
    integration.lastError = result.ok ? null : result.error;
    integration.lastCheckedAt = new Date();
    await integration.save();

    return ok(res, {
      provider: integration.provider,
      status: integration.status,
      missing: result.missing,
      live: result.live,
      detail: result.detail || null,
      lastError: integration.lastError,
      lastCheckedAt: integration.lastCheckedAt,
    });
  }),
);

export default router;
