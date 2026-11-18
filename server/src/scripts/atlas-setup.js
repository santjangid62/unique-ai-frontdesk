#!/usr/bin/env node
/**
 * Creates the Atlas project, a free M0 cluster, a database user and 0.0.0.0/0
 * network access through the Atlas Admin API, then writes MONGODB_URI to .env.
 *
 *   npm run atlas:setup              # do everything, then verify the connection
 *   npm run atlas:setup -- --seed    # ...and seed the demo workspace
 *   npm run atlas:setup -- --dry-run # print the requests instead of sending them
 *
 * Keys: ATLAS_PUBLIC_KEY / ATLAS_PRIVATE_KEY, or atlas-key.txt (line 1 public,
 * line 2 private; gitignored). The key needs Organization Owner and its API
 * access list must include 0.0.0.0/0.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const API = (process.env.ATLAS_API_BASE || 'https://cloud.mongodb.com/api/atlas/v1.0').replace(/\/$/, '');
const PROJECT = process.env.ATLAS_PROJECT_NAME || 'unique-ai-frontdesk';
const CLUSTER = process.env.ATLAS_CLUSTER_NAME || 'Cluster0';
const DB_NAME = process.env.ATLAS_DB_NAME || 'unique-frontdesk';
const DB_USER = process.env.ATLAS_DB_USER || 'unique_admin';
const projectIdOverride = (process.env.ATLAS_PROJECT_ID || '').trim();
const REGIONS = (process.env.ATLAS_REGION || 'AP_SOUTH_1,US_EAST_1').split(',').map((r) => r.trim()).filter(Boolean);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const wantSeed = args.includes('--seed');
const skipVerify = args.includes('--no-verify');
const envPath = process.env.ATLAS_ENV_PATH
  ? path.resolve(process.env.ATLAS_ENV_PATH)
  : path.join(ROOT, '.env');
const CLUSTER_TIMEOUT_MS = 25 * 60_000;

const log = {
  step: (text) => console.log(`\n\u001b[1m${text}\u001b[0m`),
  info: (text) => console.log(`   ${text}`),
  ok: (text) => console.log(`   \u001b[32m✓\u001b[0m ${text}`),
  warn: (text) => console.log(`   \u001b[33m! ${text}\u001b[0m`),
  bad: (text) => console.log(`   \u001b[31m✗ ${text}\u001b[0m`),
};
const md5 = (value) => crypto.createHash('md5').update(value).digest('hex');
const maskUri = (uri) => uri.replace(/\/\/([^:/@]+):([^@]*)@/, '//$1:••••@');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ---------------------------------------------------------------- auth ---- */

function loadKeys() {
  let publicKey = (process.env.ATLAS_PUBLIC_KEY || '').trim();
  let privateKey = (process.env.ATLAS_PRIVATE_KEY || '').trim();
  const file = path.join(ROOT, 'atlas-key.txt');

  if ((!publicKey || !privateKey) && fs.existsSync(file)) {
    const lines = fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    publicKey ||= lines[0] || '';
    privateKey ||= lines[1] || '';
  }
  return { publicKey, privateKey };
}

function parseChallenge(header) {
  const params = {};
  for (const match of header.matchAll(/([a-z]+)=(?:"([^"]*)"|([^,]*))/gi)) {
    params[match[1].toLowerCase()] = match[2] ?? match[3];
  }
  return params;
}

function digestAuthorization(keys, method, uri, challenge) {
  const qop = (challenge.qop || '').split(',')[0].trim();
  const nc = '00000001';
  const cnonce = crypto.randomBytes(8).toString('hex');
  const ha1 = md5(`${keys.publicKey}:${challenge.realm}:${keys.privateKey}`);
  const ha2 = md5(`${method}:${uri}`);
  const response = qop
    ? md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${challenge.nonce}:${ha2}`);

  const parts = [
    `username="${keys.publicKey}"`,
    `realm="${challenge.realm}"`,
    `nonce="${challenge.nonce}"`,
    `uri="${uri}"`,
    'algorithm=MD5',
    `response="${response}"`,
  ];
  if (qop) parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  return `Digest ${parts.join(', ')}`;
}

function apiMessage(payload) {
  return (
    payload?.detail ||
    payload?.errorDescription ||
    payload?.message ||
    payload?.error?.message ||
    (typeof payload?.error === 'string' ? payload.error : '') ||
    JSON.stringify(payload).slice(0, 300)
  );
}

async function call(keys, pathname, { method = 'GET', body } = {}) {
  const url = `${API}${pathname}`;
  const { pathname: pathOnly, search } = new URL(url);
  const uri = `${pathOnly}${search}`;

  const send = (authorization) =>
    fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60_000),
    });

  // Atlas answers an unauthenticated call with a Digest challenge. A stale
  // nonce comes back as another 401 with a fresh challenge, so retrying with
  // whatever nonce we were last given handles both cases.
  let challenge = null;
  let response;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await send(challenge ? digestAuthorization(keys, method, uri, challenge) : null);
    if (response.status !== 401) break;

    const header = response.headers.get('www-authenticate') || '';
    if (!header.toLowerCase().startsWith('digest')) {
      const error = new Error(`Atlas rejected the API key (401). ${(await response.text()).slice(0, 160)}`);
      error.status = 401;
      throw error;
    }
    challenge = parseChallenge(header);
    if (attempt === 2) {
      const error = new Error('Atlas rejected the API key after re-authenticating (401).');
      error.status = 401;
      throw error;
    }
  }

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text.slice(0, 400) };
  }
  if (!response.ok) {
    const error = new Error(`${method} ${pathname} → ${response.status} ${apiMessage(payload)}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

/* ------------------------------------------------------------ resources ---- */

/**
 * Free tier (M0) cannot set diskSizeGB and is not a dedicated cluster, so the
 * documented v1 shape is providerSettings with instanceSizeName M0.
 */
const freeClusterPayload = (region) => ({
  name: CLUSTER,
  clusterType: 'REPLICASET',
  providerSettings: { providerName: 'AWS', regionName: region, instanceSizeName: 'M0' },
});

const instanceSizeOf = (cluster) =>
  cluster.providerSettings?.instanceSizeName ||
  cluster.replicationSpecs?.[0]?.regionConfigs?.[0]?.electableSpecs?.instanceSize ||
  '';

async function resolveProject(keys) {
  if (projectIdOverride) {
    log.step('Project (ATLAS_PROJECT_ID)');
    const project = await call(keys, `/groups/${projectIdOverride}`);
    log.ok(`Using "${project.name}" (${project.id}) with a project-scoped key`);
    return project;
  }
  return ensureProject(keys, await pickOrg(keys));
}

async function pickOrg(keys) {
  log.step('Organization');
  const { results = [] } = await call(keys, '/orgs');
  const org = process.env.ATLAS_ORG_ID ? results.find((item) => item.id === process.env.ATLAS_ORG_ID) : results[0];
  if (!org) throw new Error('No organization visible to this key — use an Organization Owner key.');
  log.ok(`${org.name} (${org.id})`);
  return org;
}

async function ensureProject(keys, org) {
  log.step('Project');
  const { results = [] } = await call(keys, `/orgs/${org.id}/groups`);
  const existing = results.find((project) => project.name === PROJECT);
  if (existing) {
    log.ok(`Reusing "${PROJECT}" (${existing.id})`);
    return existing;
  }
  const created = await call(keys, '/groups', { method: 'POST', body: { orgId: org.id, name: PROJECT } });
  log.ok(`Created "${PROJECT}" (${created.id})`);
  return created;
}

async function ensureCluster(keys, groupId) {
  log.step('Free cluster (M0)');
  const { results = [] } = await call(keys, `/groups/${groupId}/clusters`);

  // A project may already hold a free cluster under any name, and a project
  // can only have one — reuse whatever is there instead of creating a second.
  const existing = results.find((cluster) => cluster.name === CLUSTER) || results.find((cluster) => instanceSizeOf(cluster) === 'M0');
  if (existing) {
    const kind = existing.name === CLUSTER ? 'cluster' : 'existing free cluster';
    log.ok(`Reusing ${kind} "${existing.name}" (${existing.stateName || 'unknown'})`);
    return existing;
  }

  let lastError = null;
  for (const region of REGIONS) {
    try {
      const created = await call(keys, `/groups/${groupId}/clusters`, { method: 'POST', body: freeClusterPayload(region) });
      log.ok(`Requested M0 in ${region}`);
      return created;
    } catch (error) {
      lastError = error;
      if (error.status === 409) {
        const raced = await call(keys, `/groups/${groupId}/clusters`).catch(() => ({ results: [] }));
        const reusable = (raced.results || []).find((cluster) => instanceSizeOf(cluster) === 'M0');
        if (reusable) {
          log.ok(`Reusing existing free cluster "${reusable.name}"`);
          return reusable;
        }
      }
      log.warn(`${region}: ${apiMessage(error.payload || {}) || error.message}`);
    }
  }
  throw new Error(`Could not create the free cluster — ${lastError?.message || 'unknown error'}`);
}

async function waitForCluster(keys, groupId, clusterName) {
  const startedAt = Date.now();
  let lastState = '';
  while (Date.now() - startedAt < CLUSTER_TIMEOUT_MS) {
    const cluster = await call(keys, `/groups/${groupId}/clusters/${clusterName}`);
    const state = cluster.stateName || 'UNKNOWN';
    if (state !== lastState) log.info(`Cluster state: ${state}`);
    lastState = state;
    if (state === 'IDLE') return cluster;
    await sleep(15_000);
  }
  throw new Error('The cluster did not become IDLE within 25 minutes — rerun to resume.');
}

async function ensureDatabaseUser(keys, groupId) {
  log.step('Database user');
  const password = process.env.ATLAS_DB_PASSWORD || crypto.randomBytes(18).toString('base64url');
  const roles = [{ roleName: 'readWriteAnyDatabase', databaseName: 'admin' }];
  const userPath = `/groups/${groupId}/databaseUsers/admin/${DB_USER}`;

  try {
    await call(keys, userPath);
    await call(keys, userPath, { method: 'PATCH', body: { password, roles } });
    log.ok(`Rotated password for existing "${DB_USER}"`);
  } catch (error) {
    if (error.status !== 404) throw error;
    await call(keys, `/groups/${groupId}/databaseUsers`, {
      method: 'POST',
      body: { databaseName: 'admin', groupId, username: DB_USER, password, roles },
    });
    log.ok(`Created "${DB_USER}" (readWriteAnyDatabase)`);
  }
  return { username: DB_USER, password };
}

async function ensureAccessList(keys, groupId) {
  log.step('Network access');
  try {
    // Atlas reports an existing entry inside results[].error with a 200, so the
    // body has to be inspected and not just the status code.
    const result = await call(keys, `/groups/${groupId}/accessList`, {
      method: 'POST',
      body: [{ ipAddress: '0.0.0.0/0', comment: 'Vercel + local dev' }],
    });
    const entryError = result?.results?.[0]?.error;
    if (!entryError) log.ok('Opened 0.0.0.0/0');
    else if (/already exists|duplicate/i.test(entryError)) log.ok('0.0.0.0/0 already allowed');
    else throw new Error(entryError);
  } catch (error) {
    if (/already exists|duplicate/i.test(apiMessage(error.payload || {}))) {
      log.ok('0.0.0.0/0 already allowed');
      return;
    }
    throw error;
  }
}

/* ------------------------------------------------------------ finishing ---- */

function buildUri(srv, { username, password }) {
  const raw = String(srv);
  const scheme = /^mongodb\+srv:\/\//i.test(raw) ? 'mongodb+srv://' : 'mongodb://';
  const host = raw.replace(/^mongodb(\+srv)?:\/\//i, '').replace(/\/$/, '');
  return `${scheme}${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}/${DB_NAME}?retryWrites=true&w=majority`;
}

/** Writes key=value pairs into the env file, leaving every other line alone. */
function updateEnv(values) {
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    content = pattern.test(content) ? content.replace(pattern, line) : `${content.trimEnd()}\n${line}\n`;
    // dotenv never overwrites an existing variable, so child processes
    // (db:check, seed) would otherwise inherit the previous value.
    process.env[key] = value;
  }
  fs.writeFileSync(envPath, content);
}

function envValue(key) {
  if (!fs.existsSync(envPath)) return '';
  const match = fs.readFileSync(envPath, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim() : '';
}

function ensureJwtSecrets() {
  log.step('JWT secrets');
  const generated = {};
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    if (!envValue(key)) generated[key] = crypto.randomBytes(48).toString('hex');
  }
  if (!Object.keys(generated).length) {
    log.ok('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET already set');
    return;
  }
  updateEnv(generated);
  log.ok(`Generated ${Object.keys(generated).join(' + ')} in ${path.relative(ROOT, envPath) || envPath}`);
}

function runScript(script) {
  const target = path.isAbsolute(script) ? script : path.join(ROOT, script);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [target], { cwd: ROOT, stdio: 'inherit', env: process.env });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

async function verifyConnection() {
  log.step('Verifying the new connection');
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    if ((await runScript('server/src/scripts/db-check.js')) === 0) return true;
    if (attempt < 4) {
      log.info('A new cluster can take a minute to appear in DNS — retrying in 20s…');
      await sleep(20_000);
    }
  }
  log.warn('Still not connecting. Rerun `npm run db:check` in a minute.');
  return false;
}

/* ----------------------------------------------------------------- main ---- */

(async () => {
  console.log('\n\u001b[1mMongoDB Atlas setup (Admin API)\u001b[0m');

  if (dryRun) {
    for (const region of REGIONS) {
      console.log(`\n   POST ${API}/groups/{groupId}/clusters`);
      console.log(`   ${JSON.stringify(freeClusterPayload(region), null, 2).replace(/\n/g, '\n   ')}`);
    }
    const sample = buildUri('mongodb+srv://cluster0.example.mongodb.net', {
      username: DB_USER,
      password: 'examplePassword123',
    });
    console.log(`\n   Sample URI: ${maskUri(sample)}`);
    console.log('   Dry run — no requests were sent.\n');
    process.exit(0);
  }

  const keys = loadKeys();
  if (!keys.publicKey || !keys.privateKey) {
    log.bad('No Atlas API key found.');
    console.log('   https://cloud.mongodb.com → Access Manager → API Keys → Create API Key');
    console.log('   Role: Organization Owner · API access list: 0.0.0.0/0');
    console.log('   Save the two keys in atlas-key.txt (public, then private) and rerun.\n');
    process.exit(1);
  }
  log.ok(`Using API key ${keys.publicKey}`);

  const project = await resolveProject(keys);
  const cluster = await ensureCluster(keys, project.id);
  const user = await ensureDatabaseUser(keys, project.id);
  await ensureAccessList(keys, project.id);

  log.step('Connection string');
  const clusterName = cluster.name || CLUSTER;
  const ready = cluster.stateName === 'IDLE' ? cluster : await waitForCluster(keys, project.id, clusterName);
  const srv = ready.connectionStrings?.standardSrv || ready.connectionStrings?.standard;
  if (!srv) throw new Error('Atlas has not returned a connection string yet — rerun in a minute.');
  const uri = buildUri(srv, user);
  updateEnv({ MONGODB_URI: uri });
  log.ok(`Wrote MONGODB_URI to ${path.relative(ROOT, envPath) || envPath} — ${maskUri(uri)}`);
  log.ok(`${clusterName} · ${user.username} · database ${DB_NAME}`);
  ensureJwtSecrets();

  const connected = skipVerify ? true : await verifyConnection();
  if (wantSeed) {
    log.step('Seeding the demo workspace');
    // ATLAS_SEED_SCRIPT lets the chaining be tested without a live database.
    if ((await runScript(process.env.ATLAS_SEED_SCRIPT || 'server/src/scripts/seed.js')) !== 0) {
      throw new Error('Seeding failed — run `npm run seed` to see the error.');
    }
  }

  log.step('Done');
  console.log(`   Project : ${PROJECT}`);
  console.log(`   Cluster : ${cluster.name || CLUSTER}`);
  console.log(`   User    : ${user.username} (password stored in .env)`);
  console.log(`   URI     : ${maskUri(uri)}`);
  if (!connected) console.log('\n   Next: npm run db:check');
  console.log(`   Then: ${wantSeed ? 'npm run dev' : 'npm run seed && npm run dev'}\n`);
  process.exit(0);
})().catch((error) => {
  console.error(`\n\u001b[31m✗ Atlas setup failed:\u001b[0m ${error.message}\n`);
  if (error.status === 401) console.error('  Check the key pair and that 0.0.0.0/0 is in the API key access list.\n');
  if (error.status === 403) console.error('  The key is valid but needs the Organization Owner role.\n');
  process.exit(1);
});
