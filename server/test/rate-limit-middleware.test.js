/**
 * Middleware-level test for the shared auth limiter.
 *
 *   npm run test:ratelimit-middleware
 *
 * Stubs the Upstash REST calls and runs a real express request, proving that a
 * successful login's decrement finishes before the response is flushed (a
 * res.on('finish') decrement can be frozen away on serverless).
 */
import http from 'node:http';
import { once } from 'node:events';
import express from 'express';
import { createChecker } from './helpers.js';
import { env } from '../src/config/env.js';
import { resetSharedRateLimitBreaker } from '../src/services/sharedRateLimit.js';
import { authLimiter } from '../src/middleware/rateLimit.js';

const { check, summary, exitCode } = createChecker();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const saved = { url: env.upstashRedisUrl, token: env.upstashRedisToken, fetch: global.fetch };
env.upstashRedisUrl = 'https://rate-limit.test';
env.upstashRedisToken = 'test-token';
resetSharedRateLimitBreaker();

const calls = [];
let decrementDoneAt = 0;
global.fetch = async (_url, options) => {
  const [command] = JSON.parse(options.body);
  calls.push(command[0]);
  if (command[0] === 'DECR') {
    await sleep(50);
    decrementDoneAt = Date.now();
    return { ok: true, status: 200, json: async () => [{ result: 0 }, { result: 30 }] };
  }
  return { ok: true, status: 200, json: async () => [{ result: 1 }, { result: 30 }] };
};

const app = express();
app.use(authLimiter);
app.get('/ok', (_req, res) => res.json({ ok: true }));
app.get('/fail', (_req, res) => res.status(401).json({ ok: false }));

const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;

const get = (path) =>
  new Promise((resolve, reject) => {
    const startedAt = Date.now();
    http
      .get(`${base}${path}`, (res) => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode, endedAt: Date.now(), startedAt }));
      })
      .on('error', reject);
  });

console.log('\n  rate limit middleware');

const ok = await get('/ok');
check('a successful request passes', ok.status === 200);
check('a successful request decrements the counter', calls.includes('DECR'), calls.join(','));
check('the decrement completes before the response is flushed', decrementDoneAt > 0 && ok.endedAt >= decrementDoneAt, `${decrementDoneAt} <= ${ok.endedAt}`);

calls.length = 0;
const failed = await get('/fail');
check('a failed request is not decremented', failed.status === 401 && !calls.includes('DECR'), calls.join(','));

await new Promise((resolve) => server.close(resolve));
global.fetch = saved.fetch;
env.upstashRedisUrl = saved.url;
env.upstashRedisToken = saved.token;
resetSharedRateLimitBreaker();

console.log(summary());
process.exit(exitCode());
