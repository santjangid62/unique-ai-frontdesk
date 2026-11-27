/**
 * Offline test for preview deployment URLs.
 *
 *   npm run test:preview-urls
 *
 * A Vercel preview deployment must use its own host (VERCEL_URL) for
 * CLIENT_ORIGIN and APP_URL, so CORS and email links follow the build that
 * served the request instead of a fixed alias. Each case runs in a child
 * process because env.js reads process.env at import time.
 */
import { execFileSync } from 'node:child_process';
import { createChecker } from './helpers.js';

const { check, summary, exitCode } = createChecker();

const PREVIEW_HOST = 'unique-ai-frontdesk-abc123-unique-it-team.vercel.app';

/** Imports env.js with the given environment and returns the resolved URLs. */
function resolveUrls(extraEnv) {
  const code =
    "import('./server/src/config/env.js').then((m) => console.log(JSON.stringify({ clientOrigin: m.env.clientOrigin, appUrl: m.env.appUrl })))";
  const output = execFileSync(process.execPath, ['-e', code], {
    cwd: process.cwd(),
    // Empty values keep a local .env from overriding the case under test.
    env: { ...process.env, CLIENT_ORIGIN: '', APP_URL: '', VERCEL_ENV: '', VERCEL_URL: '', ...extraEnv },
    encoding: 'utf8',
  });
  return JSON.parse(output.trim().split('\n').pop());
}

console.log('\n  preview deployment URLs');

const derived = resolveUrls({ VERCEL_ENV: 'preview', VERCEL_URL: PREVIEW_HOST });
check('preview CLIENT_ORIGIN derives from VERCEL_URL', derived.clientOrigin === `https://${PREVIEW_HOST}`, derived.clientOrigin);
check('preview APP_URL derives from VERCEL_URL', derived.appUrl === `https://${PREVIEW_HOST}`, derived.appUrl);

const explicit = resolveUrls({
  VERCEL_ENV: 'preview',
  VERCEL_URL: PREVIEW_HOST,
  CLIENT_ORIGIN: 'https://custom.example.com',
  APP_URL: 'https://custom.example.com',
});
check('an explicit CLIENT_ORIGIN still wins', explicit.clientOrigin === 'https://custom.example.com', explicit.clientOrigin);
check('an explicit APP_URL still wins', explicit.appUrl === 'https://custom.example.com', explicit.appUrl);

const withScheme = resolveUrls({ VERCEL_ENV: 'preview', VERCEL_URL: `https://${PREVIEW_HOST}/` });
check('a scheme or trailing slash in VERCEL_URL is normalised', withScheme.appUrl === `https://${PREVIEW_HOST}`, withScheme.appUrl);

const production = resolveUrls({ VERCEL_ENV: 'production', VERCEL_URL: PREVIEW_HOST });
check('production does not derive from VERCEL_URL', production.clientOrigin === 'http://localhost:5173', production.clientOrigin);
check('production APP_URL falls back to localhost', production.appUrl === 'http://localhost:5173', production.appUrl);

const outsideVercel = resolveUrls({});
check('outside Vercel the localhost defaults stay', outsideVercel.clientOrigin === 'http://localhost:5173', outsideVercel.clientOrigin);

const noHost = resolveUrls({ VERCEL_ENV: 'preview' });
check('a preview without VERCEL_URL falls back to localhost', noHost.clientOrigin === 'http://localhost:5173', noHost.clientOrigin);

console.log(summary());
process.exit(exitCode());
