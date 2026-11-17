import {
  REFRESH_COOKIE,
  createRefreshTokenValue,
  hashToken,
  refreshCookieOptions,
  refreshExpiry,
  signAccessToken,
} from '../utils/tokens.js';
import RefreshToken from '../models/RefreshToken.js';

/** Issues an access token plus a rotated refresh token stored as a hash. */
export async function issueSession(res, user, req) {
  const accessToken = signAccessToken(user);
  const refreshToken = createRefreshTokenValue();
  const expiresAt = refreshExpiry();

  await RefreshToken.create({
    userId: user._id,
    tenantId: user.tenantId || null,
    tokenHash: hashToken(refreshToken),
    expiresAt,
    ip: req?.ip || null,
    userAgent: req?.get?.('user-agent')?.slice(0, 300) || null,
  });

  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(expiresAt));

  return { accessToken, refreshToken, refreshExpiresAt: expiresAt };
}

export async function revokeSession(res, tokenValue) {
  if (tokenValue) {
    await RefreshToken.updateOne(
      { tokenHash: hashToken(tokenValue), revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}

export async function revokeAllForUser(userId) {
  await RefreshToken.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

export function readRefreshToken(req) {
  return req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken || null;
}

export default issueSession;
