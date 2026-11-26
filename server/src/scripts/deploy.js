#!/usr/bin/env node
/**
 * One-command production deploy for Unique AI Frontdesk.
 *
 * Reads MONGODB_URI / JWT secrets from .env and the Vercel token from
 * deploy-token.txt (or VERCEL_TOKEN), then:
 *   1. verifies the Vercel token
 *   2. creates/links the Vercel project to the GitHub repo
 *   3. upserts the production environment variables
 *   4. triggers a production deployment and waits for it
 *   5. seeds the production database (same Atlas cluster as .env)
 *   6. verifies /api/health, the SPA and a real login on the live URL
 *
 * Usage:
 *   npm run deploy                 # full flow
 *   npm run deploy -- --dry-run    # validate token, Atlas, project — change nothing
 *   npm run deploy -- --skip-seed  # deploy + verify without reseeding
 *   npm run deploy -- --skip-deploy --url https://...   # verify an existing URL
 *   npm run deploy -- --skip-preflight   # skip the Atlas connection test
 *
 * Never prints secret values.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { DEMO_CREDENTIALS } from './seed.js';
import { mongoUriProblem, mongoUriIsLocal } from '../config/env.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const API = (process.env.VERCEL_API_BASE || 'https://api.vercel.com').replace(/\/$/, '');
const PROJECT_NAME = process.env.VERCEL_PROJECT_NAME || 'unique-ai-frontdesk';
const GITHUB_REPO = process.env.VERCEL_GIT_REPO || 'santjangid62/unique-ai-frontdesk';
const BRANCH = process.env.VERCEL_GIT_BRANCH || 'main';
const TIMEOUT_MS = 30_000;
const BUILD_TIMEOUT_MS = 15 * 60_000;

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(`--${name}`);
const flagValue = (name) => {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));
  if (hit) return hit.split('=').slice(1).join('=');
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

const step = (text) => console.log(`\n\u001b[1m${text}\u001b[0m`);
const info = (text) => console.log(`   ${text}`);
const warn = (text) => console.log(`   \u001b[33m! ${text}\u001b[0m`);
const fail = (text) => console.log(`   \u001b[31m✗ ${text}\u001b[0m`);
const pass = (text) => console.log(`   \u001b[32m✓\u001b[0m ${text}`);

const maskUri = (uri) => uri.replace(/\/\/([^:/@]+):([^@]*)@/, '//$1:••••@');

function validateInputs({ requireMongo = true, requireToken = true, requireRemoteMongo = true } = {}) {
  step('1/6  Checking credentials');
  const problems = [];

  const mongoUri = (process.env.MONGODB_URI || '').trim();
  const accessSecret = (process.env.JWT_ACCESS_SECRET || '').trim();
  const refreshSecret = (process.env.JWT_REFRESH_SECRET || '').trim();

  const uriIssue = requireMongo || mongoUri ? mongoUriProblem(mongoUri) : null;
  if (uriIssue) problems.push(uriIssue);

  // A local MongoDB is fine for development, but a Vercel Function cannot reach
  // this machine — stop before deploying instead of failing the live checks.
  const localMongo = requireRemoteMongo && !uriIssue && mongoUriIsLocal(mongoUri);
  if (localMongo) {
    problems.push('MONGODB_URI points at a local MongoDB, which Vercel cannot reach — deploy needs MongoDB Atlas');
  }
  if (!accessSecret) problems.push('JWT_ACCESS_SECRET is empty in .env');
  if (!refreshSecret) problems.push('JWT_REFRESH_SECRET is empty in .env');

  let token = (process.env.VERCEL_TOKEN || '').trim();
  const tokenFile = path.join(ROOT, 'deploy-token.txt');
  if (!token && fs.existsSync(tokenFile)) {
    token = fs
      .readFileSync(tokenFile, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#')) || '';
  }
  if (!token && requireToken) {
    problems.push('No Vercel token: create https://vercel.com/account/tokens and save it in deploy-token.txt');
  } else if (token && token.length < 20) {
    problems.push('The token in deploy-token.txt looks too short — copy the whole token');
  }

  if (problems.length) {
    for (const problem of problems) fail(problem);
    if (localMongo) {
      console.log('\n  Create a free MongoDB Atlas cluster, then deploy again:');
      console.log('    (Local MongoDB Vercel से reach नहीं होता — Atlas URI चाहिए)');
      console.log('    1. cloud.mongodb.com → free M0 cluster → Database Access: add a user');
      console.log('    2. Network Access → 0.0.0.0/0 (Vercel egress IPs change, so allow all)');
      console.log('    3. Connect → Drivers → Node.js → mongodb+srv://… → paste as MONGODB_URI in .env');
    }
    console.log('\n  Fix these, then run `npm run deploy` again.\n');
    process.exit(1);
  }

  if (mongoUri) pass(`MONGODB_URI ${maskUri(mongoUri)}`);
  pass(`JWT_ACCESS_SECRET (${accessSecret.length} chars)`);
  pass(`JWT_REFRESH_SECRET (${refreshSecret.length} chars)`);
  if (token) pass(`Vercel token (${token.length} chars)`);

  return { mongoUri, accessSecret, refreshSecret, token };
}

async function api(token, pathname, { method = 'GET', body } = {}) {
  const response = await fetch(`${API}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((error) => {
    throw new Error(`Vercel API unreachable (${error.name === 'TimeoutError' ? 'timeout' : error.message})`);
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text.slice(0, 300) };
  }

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || payload?.error?.code || text.slice(0, 200);
    const error = new Error(`${method} ${pathname} -> ${response.status} ${message}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

/** Fail fast when this machine cannot reach the URI production will use. */
async function checkMongoReachable(uri) {
  step('   Checking the MongoDB connection');
  const { default: mongoose } = await import('mongoose');
  const connection = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 8000 });
  try {
    await connection.asPromise();
    await connection.db.admin().ping();
    pass(`MongoDB reachable ${maskUri(uri)}`);
  } catch (error) {
    throw new Error(
      `Cannot reach ${maskUri(uri)} from this machine (${String(error.message).split('\n')[0]}). ` +
        'Check the Atlas database user password and Network Access → 0.0.0.0/0.',
    );
  } finally {
    await connection.close().catch(() => {});
  }
}

const isLocalUrl = (value) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i.test(value);

async function verifyToken(token) {
  let user;
  try {
    user = await api(token, '/v2/user');
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      throw new Error(
        'Vercel rejected the token. Create a new one at https://vercel.com/account/tokens, ' +
          'paste it as the only line in deploy-token.txt (no placeholder, no quotes) and deploy again.',
      );
    }
    throw error;
  }
  pass(`Vercel account: ${user.user?.username || user.user?.email || 'ok'}`);
  return user.user;
}

async function ensureProject(token) {
  step('2/6  Project + repository link');
  let project = null;
  try {
    project = await api(token, `/v9/projects/${PROJECT_NAME}`);
    pass(`Project "${project.name}" exists`);
  } catch (error) {
    if (error.status !== 404) throw error;
    info(`Creating Vercel project "${PROJECT_NAME}"…`);
    project = await api(token, '/v10/projects', {
      method: 'POST',
      body: { name: PROJECT_NAME, framework: null },
    });
    pass(`Project "${project.name}" created`);
  }

  if (project.link?.repoId) {
    pass(`Repository linked: ${project.link.org || project.link.type}/${project.link.repo || project.link.repoId}`);
    return project;
  }

  try {
    const linked = await api(token, `/v9/projects/${project.id}/link`, {
      method: 'POST',
      body: { type: 'github', repo: GITHUB_REPO },
    });
    project = linked.project || { ...project, link: linked };
    pass(`Repository linked: ${GITHUB_REPO}`);
  } catch (error) {
    warn(`Could not link ${GITHUB_REPO} (${error.message})`);
    warn('Install the Vercel GitHub app for this repo, then rerun — deploying needs the linked repository.');
  }

  return project;
}

async function upsertEnvVars(token, project, secrets) {
  step('3/6  Production environment variables');
  // The app is served same-origin, so the production alias is the right origin.
  // A leftover localhost value in .env would break browser calls, so replace it.
  const productionUrl = `https://${project.name}.vercel.app`;
  const configuredOrigin = (process.env.CLIENT_ORIGIN || '').trim().replace(/\/$/, '');
  const configuredAppUrl = (process.env.APP_URL || '').trim().replace(/\/$/, '');
  const clientOrigin = configuredOrigin && !isLocalUrl(configuredOrigin) ? configuredOrigin : productionUrl;
  const appUrl = configuredAppUrl && !isLocalUrl(configuredAppUrl) ? configuredAppUrl : clientOrigin;
  if (isLocalUrl(configuredOrigin) || isLocalUrl(configuredAppUrl)) {
    warn(`Local CLIENT_ORIGIN/APP_URL replaced with ${productionUrl} (a localhost URL cannot be the live origin)`);
  }

  const entries = {
    MONGODB_URI: secrets.mongoUri,
    JWT_ACCESS_SECRET: secrets.accessSecret,
    JWT_REFRESH_SECRET: secrets.refreshSecret,
    NODE_ENV: 'production',
    CLIENT_ORIGIN: clientOrigin,
    APP_URL: appUrl,
  };

  for (const [key, value] of Object.entries(entries)) {
    if (!value) {
      warn(`${key} skipped (empty)`);
      continue;
    }
    try {
      await api(token, `/v10/projects/${project.id}/env?upsert=true`, {
        method: 'POST',
        body: { key, value, type: key === 'NODE_ENV' ? 'plain' : 'encrypted', target: ['production', 'preview'] },
      });
      pass(`${key} set (production + preview)`);
    } catch (error) {
      fail(`${key}: ${error.message}`);
      throw new Error(`Could not set ${key}`);
    }
  }
}

async function triggerDeploy(token, project) {
  step('4/6  Production deployment');
  if (hasFlag('skip-deploy')) {
    const manual = flagValue('url');
    if (!manual) throw new Error('--skip-deploy needs --url https://your-app.vercel.app');
    info(`Skipping deploy, verifying ${manual}`);
    return { url: manual.replace(/\/$/, ''), id: null };
  }

  if (!project.link?.repoId) {
    throw new Error(
      `${GITHUB_REPO} is not linked to the Vercel project — install the Vercel GitHub app for this repo (or link it in the dashboard) and rerun`,
    );
  }

  const deployment = await api(token, '/v13/deployments', {
    method: 'POST',
    body: {
      name: project.name,
      project: project.id,
      target: 'production',
      gitSource: { type: 'github', repoId: project.link.repoId, ref: BRANCH },
    },
  });
  info(`Deployment ${deployment.id} queued from ${GITHUB_REPO}@${BRANCH}`);

  const finished = await waitForBuild(token, deployment.id);
  const url = deploymentUrl(finished, project);
  pass(`Deployed: ${url}`);
  return { url, id: finished.id, inspector: finished.inspectorUrl };
}

/** Absolute URLs are used as-is; a bare domain is treated as a Vercel https host. */
function deploymentUrl(deployment, project) {
  const candidates = [deployment.url, ...(deployment.alias || [])].filter(Boolean).map(String);
  const absolute = candidates.find((value) => /^https?:\/\//i.test(value));
  if (absolute) return absolute.replace(/\/$/, '');
  const domain = candidates.find((value) => value.endsWith('.vercel.app')) || `${project.name}.vercel.app`;
  return `https://${domain.replace(/^https?:\/\//i, '')}`;
}

async function waitForBuild(token, id) {
  const startedAt = Date.now();
  let lastState = '';
  while (Date.now() - startedAt < BUILD_TIMEOUT_MS) {
    const deployment = await api(token, `/v13/deployments/${id}`);
    const state = deployment.readyState || deployment.status;
    if (state !== lastState) {
      info(`${state}${deployment.readySubstate ? ` (${deployment.readySubstate})` : ''}`);
      lastState = state;
    }
    if (state === 'READY') return deployment;
    if (['ERROR', 'CANCELED'].includes(state)) {
      await printBuildErrors(token, id);
      throw new Error(`Deployment finished with state ${state}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error('Deployment did not finish within 15 minutes');
}

async function printBuildErrors(token, id) {
  try {
    const events = await api(token, `/v3/deployments/${id}/events?builds=1&limit=60`);
    const lines = (Array.isArray(events) ? events : events?.events || [])
      .map((event) => event?.payload?.text || event?.text)
      .filter(Boolean)
      .slice(-25);
    if (lines.length) {
      console.log('\n   --- build log (tail) ---');
      for (const line of lines) console.log(`   ${line}`);
      console.log('   -------------------------');
    }
  } catch {
    warn('Could not load build logs; open the deployment in the Vercel dashboard.');
  }
}

function runSeed() {
  step('5/6  Production database seed');
  if (hasFlag('skip-seed')) {
    info('Skipped (--skip-seed)');
    return Promise.resolve();
  }
  info(`Seeding ${maskUri(process.env.MONGODB_URI || '')}`);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'server/src/scripts/seed.js')], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' },
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`seed exited with code ${code}`))));
    child.on('error', reject);
  });
}

async function verify(url, options = {}) {
  step('6/6  Live verification');
  const results = [];
  const record = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    if (ok) pass(name);
    else fail(`${name}${detail ? ` — ${detail}` : ''}`);
  };

  const request = async (pathname, { method = 'GET', body, token, headers = {} } = {}) => {
    const response = await fetch(`${url}${pathname}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
    return { status: response.status, payload, headers: response.headers };
  };

  // Health — retry a few times so a cold start does not fail the run.
  let health;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      health = await request('/api/health');
      if (health.status === 200) break;
    } catch (error) {
      if (attempt === 4) record('GET /api/health', false, error.message);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  const healthData = health?.payload?.data || {};
  record(
    'GET /api/health',
    health?.status === 200 && healthData.db === 'connected',
    `status=${health?.status} db=${healthData.db || 'unknown'} configured=${healthData.dbConfigured}`,
  );

  if (healthData.db !== 'connected') {
    warn('Database not connected on the deployment — check the MONGODB_URI env var and the Atlas IP allowlist (0.0.0.0/0).');
  }

  // SPA shell
  try {
    const home = await request('/');
    record(
      'GET / (SPA)',
      home.status === 200 && /<div id="root"|<script[^>]+src=/i.test(home.payload?.raw || ''),
      `status=${home.status} type=${home.headers.get('content-type')}`,
    );
  } catch (error) {
    record('GET / (SPA)', false, error.message);
  }

  // Browser calls from the deployment's own origin must be allowed.
  try {
    const cors = await request('/api/health', { headers: { Origin: url } });
    const allowed = cors.headers.get('access-control-allow-origin');
    record('CORS allows the live origin', allowed === url || allowed === '*', `allow-origin=${allowed || 'missing'}`);
  } catch (error) {
    record('CORS allows the live origin', false, error.message);
  }

  // Real login with the seeded demo business admin.
  const creds = options.credentials || DEMO_CREDENTIALS.businessAdmin;
  let accessToken = null;
  try {
    const login = await request('/api/auth/login', { method: 'POST', body: creds });
    accessToken = login.payload?.data?.accessToken || null;
    record(
      `POST /api/auth/login (${creds.email})`,
      login.status === 200 && Boolean(accessToken),
      `status=${login.status} ${accessToken ? '' : JSON.stringify(login.payload).slice(0, 160)}`,
    );
    record(
      'Login returns tenant context',
      Boolean(login.payload?.data?.tenant?.slug),
      login.payload?.data?.tenant?.slug || 'missing tenant',
    );
  } catch (error) {
    record('POST /api/auth/login', false, error.message);
  }

  if (accessToken) {
    try {
      const me = await request('/api/auth/me', { token: accessToken });
      record(
        'GET /api/auth/me',
        me.status === 200 && Boolean(me.payload?.data?.user?.email),
        `status=${me.status} role=${me.payload?.data?.user?.role || '?'}`,
      );
    } catch (error) {
      record('GET /api/auth/me', false, error.message);
    }

    try {
      const leads = await request('/api/leads', { token: accessToken });
      record('GET /api/leads (tenant scoped)', leads.status === 200 && Array.isArray(leads.payload?.data), `status=${leads.status}`);
    } catch (error) {
      record('GET /api/leads', false, error.message);
    }
  }

  // Anonymous access must be rejected.
  try {
    const anonymous = await request('/api/leads');
    record('Anonymous /api/leads rejected', anonymous.status === 401, `status=${anonymous.status}`);
  } catch (error) {
    record('Anonymous /api/leads rejected', false, error.message);
  }

  // Public widget config powers the website chat widget.
  try {
    const widget = await request('/api/public/widget/unique-computers/config');
    record('GET /api/public/widget/…/config', widget.status === 200, `status=${widget.status}`);
  } catch (error) {
    record('GET /api/public/widget/…/config', false, error.message);
  }

  // A bad password must not authenticate.
  try {
    const bad = await request('/api/auth/login', {
      method: 'POST',
      body: { email: creds.email, password: 'definitely-wrong-password' },
    });
    record('Invalid password rejected', bad.status === 401, `status=${bad.status}`);
  } catch (error) {
    record('Invalid password rejected', false, error.message);
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\n   ${results.length - failed.length}/${results.length} checks passed`);
  return failed;
}

(async () => {
  console.log('\n\u001b[1mUnique AI Frontdesk — one-command production deploy\u001b[0m');
  const skipDeploy = hasFlag('skip-deploy');
  const dryRun = hasFlag('dry-run');
  const secrets = validateInputs({
    requireMongo: !hasFlag('skip-seed'),
    requireToken: !skipDeploy,
    requireRemoteMongo: !skipDeploy,
  });

  if (!hasFlag('skip-preflight') && secrets.mongoUri) {
    await checkMongoReachable(secrets.mongoUri);
  }

  let project = null;
  if (!skipDeploy) {
    step('   Verifying Vercel token');
    await verifyToken(secrets.token);
    if (dryRun) {
      const existing = await api(secrets.token, `/v9/projects/${PROJECT_NAME}`).catch((error) => {
        if (error.status === 404) return null;
        throw error;
      });
      step('Dry run — nothing was changed');
      info(
        existing
          ? `Project "${existing.name}" exists; a real run would set six env vars and deploy ${BRANCH}`
          : `Project "${PROJECT_NAME}" would be created, linked to ${GITHUB_REPO} and deployed`,
      );
      info(`CLIENT_ORIGIN / APP_URL would be https://${PROJECT_NAME}.vercel.app`);
      info('Remove --dry-run to deploy for real.');
      process.exit(0);
    }
    project = await ensureProject(secrets.token);
    await upsertEnvVars(secrets.token, project, secrets);
  }

  const { url, inspector } = await triggerDeploy(secrets.token, project);

  await runSeed();

  const failed = await verify(url);

  step('Summary');
  console.log(`   Live URL   : ${url}`);
  console.log(`   Dashboard  : https://vercel.com/dashboard`);
  if (inspector) console.log(`   Build logs : ${inspector}`);
  console.log(`   Admin login: ${DEMO_CREDENTIALS.businessAdmin.email} / ${DEMO_CREDENTIALS.businessAdmin.password}`);
  console.log(`   Super admin: ${DEMO_CREDENTIALS.superAdmin.email} / ${DEMO_CREDENTIALS.superAdmin.password}`);

  if (failed.length) {
    console.log(`\n   \u001b[31m${failed.length} live check(s) failed:\u001b[0m`);
    for (const result of failed) console.log(`   - ${result.name} ${result.detail}`);
    console.log('');
    process.exit(1);
  }

  console.log('\n   \u001b[32mDeployment is live and verified.\u001b[0m\n');
  process.exit(0);
})().catch(async (error) => {
  console.error(`\n\u001b[31m✗ Deploy failed:\u001b[0m ${error.message}\n`);
  if (error.status === 403) {
    console.error('  The Vercel token was rejected. Create a new one at https://vercel.com/account/tokens and save it in deploy-token.txt.\n');
  }
  process.exit(1);
});
