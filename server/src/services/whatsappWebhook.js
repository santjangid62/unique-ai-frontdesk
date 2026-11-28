import crypto from 'node:crypto';
import { env } from '../config/env.js';

/** Phone number ID from a Cloud API webhook payload ('' when absent). */
export function phoneNumberIdFromPayload(body) {
  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      const id = change?.value?.metadata?.phone_number_id;
      if (id) return String(id);
    }
  }
  return '';
}

/**
 * Secret for verifying a webhook: the tenant's own app secret when configured,
 * otherwise the platform-wide fallback used by single-app deployments.
 */
export function webhookAppSecret(integration) {
  return integration?.config?.appSecret || env.whatsappAppSecret || '';
}

/** Constant-time string comparison for tokens and signatures. */
export function tokenMatches(expected, supplied) {
  if (!expected || !supplied) return false;
  const a = Buffer.from(String(expected));
  const b = Buffer.from(String(supplied));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** True when `signature` is the X-Hub-Signature-256 for `rawBody`. */
export function signatureMatches(rawBody, signature, secret) {
  if (!secret || !signature) return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody || Buffer.from('')).digest('hex')}`;
  return tokenMatches(expected, signature);
}
