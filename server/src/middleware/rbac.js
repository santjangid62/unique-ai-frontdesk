import { ApiError } from '../utils/ApiError.js';
import { audit } from '../utils/audit.js';

/** Role guard. Every protected route declares which roles may use it. */
export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) {
    return next(ApiError.forbidden('Your role does not allow this operation'));
  }
  return next();
};

export const requireSuperAdmin = requireRole('super_admin');
export const requireBusinessAdmin = requireRole('business_admin');
export const requireTenantUser = requireRole('business_admin', 'staff');

/**
 * Rejects any attempt to address a tenant other than the authenticated one and
 * records the attempt in the audit trail.
 */
export const tenantScopeGuard = (req, _res, next) => {
  if (!req.user || req.user.role === 'super_admin') return next();
  const supplied = req.headers['x-tenant-id'] || req.body?.tenantId || req.query?.tenantId;
  if (supplied && String(supplied) !== String(req.user.tenantId)) {
    audit(req, {
      action: 'security.cross_tenant_attempt',
      entity: 'Tenant',
      entityId: supplied,
      severity: 'critical',
      meta: { path: req.originalUrl, method: req.method },
    });
    return next(ApiError.forbidden('Cross-tenant access is not allowed'));
  }
  return next();
};

/**
 * Resolves the tenant for operational data. Business users always act on their
 * own tenant; platform accounts must name a tenant explicitly.
 */
export function resolveTenantId(req, { allowSuperAdmin = false } = {}) {
  if (req.user?.role === 'super_admin') {
    if (!allowSuperAdmin) {
      throw ApiError.forbidden('Platform accounts cannot read business operational data');
    }
    const supplied = req.query?.tenantId || req.headers['x-tenant-id'];
    if (!supplied) throw ApiError.badRequest('tenantId is required for platform access');
    return String(supplied);
  }
  if (!req.user?.tenantId) throw ApiError.forbidden('No business is linked to this account');
  return String(req.user.tenantId);
}

export default requireRole;
