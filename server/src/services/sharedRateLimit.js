import { env } from '../config/env.js';

const TIMEOUT_MS = 1500;

/** True when a shared Upstash Redis REST store is configured. */
export function sharedRateLimitConfigured() {
  return Boolean(env.upstashRedisUrl && env.upstashRedisToken);
}

/** Redis key for one scope and caller (IP or tenant). */
export function rateLimitKey(scope, identifier) {
  return `uaf:ratelimit:${scope}:${String(identifier || 'unknown')}`;
}

/** Runs Redis commands through the Upstash REST pipeline endpoint. */
function createRunner({ url, token, fetchImpl }) {
  const endpoint = `${String(url).replace(/\/+$/, '')}/pipeline`;
  return async (commands) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(commands),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Upstash returned HTTP ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload)) throw new Error('Upstash returned an unexpected response');
      return payload;
    } finally {
      clearTimeout(timer);
    }
  };
}

function positiveTtl(ttl) {
  return Number(ttl?.result) > 0;
}

/**
 * Increments a fixed-window counter in Upstash Redis.
 *
 * A pipeline increments the key and reads its TTL; when the key has no TTL
 * (first hit, or an earlier request died before expiring it) a separate
 * PEXPIRE is sent, so a counter can never stay stuck forever. Returns the
 * post-increment count. Throws when the store is unreachable or misconfigured;
 * callers fall back to the in-memory limiter.
 */
export async function incrementWindow({
  key,
  windowMs,
  url = env.upstashRedisUrl,
  token = env.upstashRedisToken,
  fetchImpl = fetch,
}) {
  if (!url || !token) throw new Error('Upstash Redis is not configured');
  const run = createRunner({ url, token, fetchImpl });

  const [incremented, ttl] = await run([
    ['INCR', key],
    ['TTL', key],
  ]);

  const count = Number(incremented?.result);
  if (!Number.isFinite(count) || incremented?.error) {
    throw new Error(incremented?.error || 'Upstash returned no counter');
  }

  if (!positiveTtl(ttl)) {
    await run([['PEXPIRE', key, Math.max(1000, Number(windowMs) || 60000)]]);
  }

  return count;
}

/**
 * Removes one hit from the counter, used for `skipSuccessfulRequests` limits.
 * A counter driven below zero is deleted instead of left negative.
 */
export async function decrementWindow({
  key,
  windowMs,
  url = env.upstashRedisUrl,
  token = env.upstashRedisToken,
  fetchImpl = fetch,
}) {
  if (!url || !token) throw new Error('Upstash Redis is not configured');
  const run = createRunner({ url, token, fetchImpl });

  const [decremented, ttl] = await run([
    ['DECR', key],
    ['TTL', key],
  ]);

  const count = Number(decremented?.result);
  if (!Number.isFinite(count) || decremented?.error) {
    throw new Error(decremented?.error || 'Upstash returned no counter');
  }

  if (count < 0) {
    await run([['DEL', key]]);
    return 0;
  }

  if (!positiveTtl(ttl)) {
    await run([['PEXPIRE', key, Math.max(1000, Number(windowMs) || 60000)]]);
  }

  return count;
}
