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
  sharedRateLimitConfigured,
} from '../src/services/sharedRateLimit.js';
import { apiLimiter, authLimiter, chatLimiter } from '../src/middleware/rateLimit.js';

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

const saved = { url: env.upstashRedisUrl, token: env.upstashRedisToken };
env.upstashRedisUrl = 'https://example.upstash.io';
env.upstashRedisToken = 'token';
check('configured with both values', sharedRateLimitConfigured() === true);
env.upstashRedisUrl = saved.url;
env.upstashRedisToken = saved.token;

console.log(summary());
process.exit(exitCode());
