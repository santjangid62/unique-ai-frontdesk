import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyAccessToken } from '../utils/tokens.js';
import User from '../models/User.js';
import Tenant from '../models/Tenant.js';

/**
 * Verifies the access token, loads the account and its tenant, and rejects
 * inactive accounts or suspended businesses. Tenant identity is always taken
 * from this server-side context, never from the request body.
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!bearer) throw ApiError.unauthorized('Authentication required');

  let payload;
  try {
    payload = verifyAccessToken(bearer);
  } catch {
    throw ApiError.unauthorized('Session expired, please sign in again');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');

  let tenant = null;
  if (user.role !== 'super_admin') {
    if (!user.tenantId) throw ApiError.forbidden('No business is linked to this account');
    tenant = await Tenant.findById(user.tenantId).select('name slug status industry planCode');
    if (!tenant) throw ApiError.forbidden('Business account not found');
    if (tenant.status === 'inactive') throw ApiError.forbidden('Business account is inactive');
    if (tenant.status === 'suspended') throw ApiError.forbidden('Business account is suspended');
  }

  req.user = {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId ? String(user.tenantId) : null,
  };
  req.tenant = tenant ? tenant.toJSON() : null;
  next();
});

export default authenticate;
