import AuditLog from '../models/AuditLog.js';

/**
 * Writes an audit record. Audit failures must never break the request, so
 * errors are swallowed after being logged.
 */
export async function audit(req, entry) {
  try {
    await AuditLog.create({
      tenantId: entry.tenantId ?? req?.user?.tenantId ?? null,
      actorId: entry.actorId ?? req?.user?.id ?? null,
      actorRole: entry.actorRole ?? req?.user?.role ?? null,
      action: entry.action,
      entity: entry.entity || null,
      entityId: entry.entityId ? String(entry.entityId) : null,
      severity: entry.severity || 'info',
      meta: entry.meta || undefined,
      ip: req?.ip || null,
      userAgent: req?.get?.('user-agent')?.slice(0, 300) || null,
    });
  } catch (error) {
    console.error('[audit] failed to write entry', error.message);
  }
}
