/**
 * Offline tests for the shared Upstash rate-limit counter.
 *
 *   npm run test:ratelimit
 *
 * fetch is replaced with a fake, so no Redis account or network is needed.
 */
import { createChecker } from './helpers.js';
import { env } from '../src/config/env.js';
import {
  decrementWindow,
  incrementWindow,
  rateLimitKey,
  resetSharedRateLimitBreaker,
  sharedRateLimitConfigured,
  sharedRateLimitReady,
} from '../src/services/sharedRateLimit.js';
import {
  apiLimiter,
  authLimiter,
  chatLimiter,
  clampedLimit,
  normalizeIpAddress,
  rateLimitIdentity,
} from '../src/middleware/rateLimit.js';

const { check, summary, exitCode } = createChecker();

console.log('\n  shared rate limit store');

check('keys are scoped and namespaced', rateLimitKey('whatsapp-verify', '1.2.3.4') === 'uaf:ratelimit:whatsapp-verify:1.2.3.4');
check('missing identifiers become unknown', rateLimitKey('scope', '') === 'uaf:ratelimit:scope:unknown');

check('not configured without a URL', sharedRateLimitConfigured() === false);

const calls = [];
const fakeFetch = (responses) => async (url, options) => {
  calls.push({ url, options, body: JSON.parse(options.body) });
  const body = responses.shift();
  if (body instanceof Error) throw body;
  return { ok: true, status: 200, json: async () => body };
};

calls.length = 0;
const first = await incrementWindow({
  key: 'uaf:ratelimit:test:1',
  windowMs: 60000,
  url: 'https://example.upstash.io/',
  token: 'secret-token',
  fetchImpl: fakeFetch([
    [{ result: 1 }, { result: -1 }],
    [{ result: 1 }],
  ]),
});
check('first hit returns the incremented count', first === 1);
check('calls the pipeline endpoint', calls[0]?.url === 'https://example.upstash.io/pipeline', calls[0]?.url);
check('sends the REST token', calls[0]?.options?.headers?.Authorization === 'Bearer secret-token');
check('increments and reads the TTL', calls[0]?.body?.[0]?.[0] === 'INCR' && calls[0]?.body?.[1]?.[0] === 'TTL');
check('sets an expiry when the key has none', calls[1]?.body?.[0]?.[0] === 'PEXPIRE' && calls[1]?.body?.[0]?.[2] === 60000);

calls.length = 0;
const second = await incrementWindow({
  key: 'uaf:ratelimit:test:2',
  windowMs: 60000,
  url: 'https://example.upstash.io',
  token: 'secret-token',
  fetchImpl: fakeFetch([
    [{ result: 7 }, { result: 42 }],
  ]),
});
check('an existing window is not re-expired', second === 7 && calls.length === 1);

let failed = false;
try {
  await incrementWindow({
    key: 'k',
    windowMs: 1000,
    url: 'https://example.upstash.io',
    token: 'secret-token',
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
  });
} catch {
  failed = true;
}
check('a store error rejects so the caller can fall back', failed === true);
resetSharedRateLimitBreaker();

calls.length = 0;
const decreased = await decrementWindow({
  key: 'uaf:ratelimit:auth:1',
  windowMs: 60000,
  url: 'https://example.upstash.io',
  token: 'secret-token',
  fetchImpl: fakeFetch([
    [{ result: 4 }, { result: 30 }],
  ]),
});
check('decrement removes one hit', decreased === 4 && calls.length === 1);

calls.length = 0;
const cleared = await decrementWindow({
  key: 'uaf:ratelimit:auth:2',
  windowMs: 60000,
  url: 'https://example.upstash.io',
  token: 'secret-token',
  fetchImpl: fakeFetch([
    [{ result: -1 }, { result: 30 }],
    [{ result: 1 }],
  ]),
});
check('decrement below zero clears the key', cleared === 0 && calls[1]?.body?.[0]?.[0] === 'DEL');

check('auth, api and chat limiters are middleware', [authLimiter, apiLimiter, chatLimiter].every((fn) => typeof fn === 'function'));

check('fallback limits are split across instances', clampedLimit(1200, 5) === 240, String(clampedLimit(1200, 5)));
check('small limits stay at least one', clampedLimit(3, 5) === 1);
check('an invalid instance count falls back to one', clampedLimit(30, 0) === 30);

check('identity prefers the signed-in user', rateLimitIdentity({ user: { id: 'u1' }, ip: '1.1.1.1' }) === 'user:u1');
check('identity uses the verified token subject', rateLimitIdentity({ auth: { sub: 'u2' }, ip: '1.1.1.1' }) === 'user:u2');
check('identity falls back to the token tenant', rateLimitIdentity({ auth: { tenantId: 't1' }, ip: '1.1.1.1' }) === 'tenant:t1');
check('identity falls back to the loaded tenant', rateLimitIdentity({ tenant: { id: 't2' }, ip: '1.1.1.1' }) === 'tenant:t2');
check('anonymous requests stay keyed by IP', rateLimitIdentity({ ip: '1.1.1.1' }) === 'ip:1.1.1.1');

check('IPv4 addresses are unchanged', normalizeIpAddress('203.0.113.5') === '203.0.113.5');
check('IPv4-mapped IPv6 becomes IPv4', normalizeIpAddress('::ffff:203.0.113.5') === '203.0.113.5');
check('IPv6 collapses to its /64 prefix', normalizeIpAddress('2001:db8:1:2:aaaa:bbbb:cccc:dddd') === '2001:db8:1:2::/64');
check(
  'addresses in one /64 share a key',
  normalizeIpAddress('2001:db8:1:2:1::1') === normalizeIpAddress('2001:db8:1:2:ffff::9'),
);
check('compressed IPv6 is expanded before truncating', normalizeIpAddress('2001:db8::1') === '2001:db8:0:0::/64');
check('loopback keeps a stable key', normalizeIpAddress('::1') === '0:0:0:0::/64');
check('zone ids are ignored', normalizeIpAddress('fe80::1%eth0') === 'fe80:0:0:0::/64');
check('a missing IP becomes unknown', normalizeIpAddress('') === 'unknown');

const saved = { url: env.upstashRedisUrl, token: env.upstashRedisToken };
env.upstashRedisUrl = 'https://example.upstash.io';
env.upstashRedisToken = 'token';
check('configured with both values', sharedRateLimitConfigured() === true);

resetSharedRateLimitBreaker();
check('ready when configured and not paused', sharedRateLimitReady() === true);

let attempts = 0;
const failingFetch = async () => {
  attempts += 1;
  return { ok: false, status: 503, json: async () => ({}) };
};
const options = { key: 'uaf:ratelimit:test:breaker', windowMs: 60000, url: env.upstashRedisUrl, token: env.upstashRedisToken };
try {
  await incrementWindow({ ...options, fetchImpl: failingFetch });
} catch {
  // expected: the failure pauses the store
}
check('a failure pauses the shared store', sharedRateLimitReady() === false);
const attemptsBefore = attempts;
try {
  await incrementWindow({ ...options, fetchImpl: failingFetch });
} catch {
  // expected: paused stores fail fast without a network call
}
check('a paused store is not called again', attempts === attemptsBefore);
resetSharedRateLimitBreaker();
check('reset restores readiness', sharedRateLimitReady() === true);

env.upstashRedisUrl = saved.url;
env.upstashRedisToken = saved.token;
resetSharedRateLimitBreaker();

console.log(summary());
process.exit(exitCode());
