#!/usr/bin/env node
/**
 * Creates everything needed on MongoDB Atlas through the Admin API and writes
 * the connection string to .env — one command once the API key is in place.
 *
 *   npm run atlas:setup                # project + M0 cluster + DB user + 0.0.0.0/0 + .env
 *   npm run atlas:setup -- --seed      # ...and seed the demo workspace
 *
 * Keys are read from ATLAS_PUBLIC_KEY / ATLAS_PRIVATE_KEY, or from
 * atlas-key.txt (first line public key, second line private key; that file is
 * gitignored). The key needs the Organization Owner role and its API access
 * list must include 0.0.0.0/0 (or this machine's IP).
 *
 * Uses HTTP Digest auth (what Atlas API keys use) and prints the URI masked.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const API = 'https://cloud.mongodb.com/api/atlas/v1.0';
const PROJECT_NAME = process.env.ATLAS_PROJECT_NAME || 'unique-ai-frontdesk';
const CLUSTER_NAME = process.env.ATLAS_CLUSTER_NAME || 'Cluster0';
const DB_NAME = process.env.ATLAS_DB_NAME || 'unique-frontdesk';
const DB_USERNAME = process.env.ATLAS_DB_USER || 'unique_admin';
const REGIONS = (process.env.ATLAS_REGION || 'AP_SOUTH_1,US_EAST_1')
  .split(',')
  .map((region) => region.trim())
  .filter(Boolean);
const CLUSTER_TIMEOUT_MS = 25 * 60_000;

const step = (text) => console.log(`\n\u001b[1m${text}\u001b[0m`);
const info = (text) => console.log(`   ${text}`);
const ok = (text) => console.log(`   \u001b[32m✓\u001b[0m ${text}`);
const warn = (text) => console.log(`   \u001b[33m! ${text}\u001b[0m`);
const bad = (text) => console.log(`   \u001b[31m✗ ${text}\u001b[0m`);
const maskUri = (uri) => uri.replace(/\/\/([^:/@]+):([^@]*)@/, '//$1:••••@');
const md5 = (value) => crypto.createHash('md5').update(value).digest('hex');

function loadKeys() {
  let publicKey = (process.env.ATLAS_PUBLIC_KEY || '').trim();
  let privateKey = (process.env.ATLAS_PRIVATE_KEY || '').trim();

  if (!publicKey || !privateKey) {
    const file = path.join(ROOT, 'atlas-key.txt');
    if (fs.existsSync(file)) {
      const lines = fs
        .readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
      publicKey = publicKey || lines[0] || '';
      privateKey = privateKey || lines[1] || '';
    }
  }
  return { publicKey, privateKey };
}

function parseChallenge(header) {
  const params = {};
  const pattern = /([a-z]+)=(?:"([^"]*)"|([^,]*))/gi;
  let match;
  while ((match = pattern.exec(header))) {
    params[match[1].toLowerCase()] = match[2] !== undefined ? match[2] : match[3];
  }
  return params;
}

function digestHeader({ username, password, method, uri, challenge }) {
  const algorithm = (challenge.algorithm || 'MD5').toUpperCase();
  if (!algorithm.startsWith('MD5')) {
    throw new Error(`Atlas asked for an unsupported auth algorithm: ${challenge.algorithm}`);
  }
  const nc = '00000001';
  const cnonce = crypto.randomBytes(8).toString('hex');
  const qop = (challenge.qop || '').split(',')[0].trim();

  const ha1 = md5(`${username}:${challenge.realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  const response = qop
    ? md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${challenge.nonce}:${ha2}`);

  const parts = [
    `username="${username}"`,
    `realm="${challenge.realm}"`,
    `nonce="${challenge.nonce}"`,
    `uri="${uri}"`,
    `algorithm=${challenge.algorithm || 'MD5'}`,
    `response="${response}"`,
  ];
  if (qop) parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  return `Digest ${parts.join(', ')}`;
}

function apiMessage(payload) {
  return (
    payload?.detail ||
    payload?.errorDescription ||
    payload?.error?.message ||
    payload?.message ||
    (typeof payload?.error === 'string' ? payload.error : '') ||
    JSON.stringify(payload).slice(0, 300)
  );
}

async function atlas(keys, pathname, { method = 'GET', body } = {}) {
  const url = `${API}${pathname}`;
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

  let response;
  try {
    response = await send(null);
  } catch (error) {
    throw new Error(`Atlas API unreachable (${error.name === 'TimeoutError' ? 'timeout' : error.message})`);
  }

  if (response.status === 401) {
    const challengeHeader = response.headers.get('www-authenticate') || '';
    if (!challengeHeader.toLowerCase().startsWith('digest')) {
      const text = await response.text();
      const error = new Error(`Atlas rejected the API key (401). ${text.slice(0, 160)}`);
      error.status = 401;
      throw error;
    }
    const parsed = new URL(url);
    const uri = `${parsed.pathname}${parsed.search}`;
    const authorization = digestHeader({
      username: keys.publicKey,
      password: keys.privateKey,
      method,
      uri,
      challenge: parseChallenge(challengeHeader),
    });
    response = await send(authorization);
  }

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text.slice(0, 400) };
  }

  if (!response.ok) {
    const error = new Error(`${method} ${pathname} -> ${response.status} ${apiMessage(payload)}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function pickOrg(keys) {
  step('1/7  Organization');
  const orgs = await atlas(keys, '/orgs');
  const list = orgs.results || [];
  if (!list.length) throw new Error('This API key has no organizations. Use an Organization Owner key.');

  const preferred = process.env.ATLAS_ORG_ID
    ? list.find((org) => org.id === process.env.ATLAS_ORG_ID)
    : list[0];
  if (!preferred) throw new Error(`Organization ${process.env.ATLAS_ORG_ID} is not visible to this key.`);

  ok(`${preferred.name} (${preferred.id})`);
  return preferred;
}

async function ensureProject(keys, org) {
  step('2/7  Project');
  const projects = await atlas(keys, `/orgs/${org.id}/groups`);
  const existing = (projects.results || []).find((project) => project.name === PROJECT_NAME);
  if (existing) {
    ok(`Reusing project "${PROJECT_NAME}" (${existing.id})`);
    return existing;
  }

  const created = await atlas(keys, '/groups', {
    method: 'POST',
    body: { orgId: org.id, name: PROJECT_NAME },
  });
  ok(`Created project "${PROJECT_NAME}" (${created.id})`);
  return created;
}

const clusterConfig = (regionName) => ({
  name: CLUSTER_NAME,
  clusterType: 'REPLICASET',
  diskSizeGB: 0.5,
  replicationSpecs: [
    {
      zoneName: 'Zone 1',
      regionConfigs: [
        {
          providerName: 'AWS',
          regionName,
          priority: 7,
          electableSpecs: { instanceSize: 'M0', nodeCount: 3 },
        },
      ],
    },
  ],
});

async function ensureCluster(keys, groupId) {
  step('3/7  Free cluster (M0)');
  try {
    const existing = await atlas(keys, `/groups/${groupId}/clusters/${CLUSTER_NAME}`);
    ok(`Cluster "${CLUSTER_NAME}" already exists (${existing.stateName || 'exists'})`);
    return existing;
  } catch (error) {
    if (error.status !== 404) throw error;
  }

  let lastError = null;
  for (const region of REGIONS) {
    try {
      info(`Creating M0 in ${region}…`);
      const created = await atlas(keys, `/groups/${groupId}/clusters`, {
        method: 'POST',
        body: clusterConfig(region),
      });
      ok(`Cluster "${CLUSTER_NAME}" requested in ${region}`);
      return created;
    } catch (error) {
      lastError = error;
      warn(`${region} failed: ${apiMessage(error.payload || {}) || error.message}`);
    }
  }
  throw new Error(`Could not create the free cluster (${lastError?.message || 'unknown error'})`);
}

async function waitForCluster(keys, groupId) {
  const startedAt = Date.now();
  let lastState = '';
  while (Date.now() - startedAt < CLUSTER_TIMEOUT_MS) {
    const cluster = await atlas(keys, `/groups/${groupId}/clusters/${CLUSTER_NAME}`);
    const state = cluster.stateName || 'UNKNOWN';
    if (state !== lastState) {
      info(`Cluster state: ${state}`);
      lastState = state;
    }
    if (state === 'IDLE') return cluster;
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  throw new Error('The cluster did not become IDLE within 25 minutes; rerun the script to resume.');
}

function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let password = '';
  for (let index = 0; index < 24; index += 1) {
    password += alphabet[crypto.randomInt(alphabet.length)];
  }
  return password;
}

async function ensureDatabaseUser(keys, groupId) {
  step('4/7  Database user');
  const username = DB_USERNAME;
  const password = process.env.ATLAS_DB_PASSWORD || generatePassword();
  const body = {
    databaseName: 'admin',
    groupId,
    username,
    password,
    roles: [{ roleName: 'readWriteAnyDatabase', databaseName: 'admin' }],
  };

  try {
    await atlas(keys, `/groups/${groupId}/databaseUsers/admin/${username}`);
    await atlas(keys, `/groups/${groupId}/databaseUsers/admin/${username}`, {
      method: 'PATCH',
      body: { password, roles: body.roles },
    });
    ok(`Rotated password for existing user "${username}"`);
  } catch (error) {
    if (error.status !== 404) throw error;
    await atlas(keys, `/groups/${groupId}/databaseUsers`, { method: 'POST', body });
    ok(`Created database user "${username}" (readWriteAnyDatabase)`);
  }

  return { username, password };
}

async function ensureAccessList(keys, groupId) {
  step('5/7  Network access (0.0.0.0/0)');
  const entry = { ipAddress: '0.0.0.0/0', comment: 'Vercel deploy + local dev' };
  try {
    await atlas(keys, `/groups/${groupId}/accessList`, { method: 'POST', body: [entry] });
    ok('Opened 0.0.0.0/0');
  } catch (error) {
    const message = apiMessage(error.payload || {});
    if (/already exists|duplicate/i.test(message)) {
      ok('0.0.0.0/0 already allowed');
      return;
    }
    throw error;
  }
}

function buildUri(srv, username, password) {
  const host = String(srv).replace(/^mongodb(\+srv)?:\/\//, '').replace(/\/$/, '');
  return `mongodb+srv://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}/${DB_NAME}?retryWrites=true&w=majority`;
}

function writeEnv(uri) {
  const envPath = path.join(ROOT, '.env');
  const line = `MONGODB_URI=${uri}`;
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  if (/^MONGODB_URI=.*$/m.test(content)) {
    content = content.replace(/^MONGODB_URI=.*$/m, line);
  } else {
    content = `${content.trimEnd()}\n${line}\n`;
  }
  fs.writeFileSync(envPath, content);
  ok(`Wrote MONGODB_URI to .env — ${maskUri(uri)}`);
}

function runNode(script, args = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, script), ...args], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

async function verifyConnection() {
  step('7/7  Verifying the new connection');
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const code = await runNode('server/src/scripts/db-check.js');
    if (code === 0) return true;
    if (attempt < 4) {
      info('DNS for a new cluster can take a minute — retrying in 20s…');
      await new Promise((resolve) => setTimeout(resolve, 20_000));
    }
  }
  warn('Could not connect yet. Rerun `npm run db:check` in a minute.');
  return false;
}

(async () => {
  console.log('\n\u001b[1mMongoDB Atlas setup (Admin API)\u001b[0m');

  const keys = loadKeys();
  if (!keys.publicKey || !keys.privateKey) {
    bad('No Atlas API key found.');
    console.log('   Create one: https://cloud.mongodb.com → Access Manager → API Keys → Create API Key');
    console.log('   Role: Organization Owner · API Access List: 0.0.0.0/0');
    console.log('   Then save the two lines in atlas-key.txt (public, then private) and rerun.\n');
    process.exit(1);
  }
  if (keys.publicKey.length < 8 || keys.privateKey.length < 8) {
    bad('The keys in atlas-key.txt look too short — copy the full public and private keys.');
    process.exit(1);
  }
  ok(`Using API key ${keys.publicKey}`);

  const org = await pickOrg(keys);
  const project = await ensureProject(keys, org);
  const cluster = await ensureCluster(keys, project.id);
  const user = await ensureDatabaseUser(keys, project.id);
  await ensureAccessList(keys, project.id);

  step('6/7  Connection string');
  const ready = cluster.stateName === 'IDLE' ? cluster : await waitForCluster(keys, project.id);
  const srv = ready.connectionStrings?.standardSrv || ready.connectionStrings?.standard;
  if (!srv) throw new Error('Atlas did not return a connection string for this cluster yet. Rerun in a minute.');
  const uri = buildUri(srv, user.username, user.password);
  writeEnv(uri);
  ok(`Cluster: ${CLUSTER_NAME} · user: ${user.username} · database: ${DB_NAME}`);

  const connected = await verifyConnection();

  if (process.argv.includes('--seed')) {
    step('Seeding the demo workspace');
    await runNode('server/src/scripts/seed.js');
  }

  console.log('\n\u001b[1mDone\u001b[0m');
  console.log(`   Atlas project : ${PROJECT_NAME}`);
  console.log(`   Cluster       : ${CLUSTER_NAME}`);
  console.log(`   Database user : ${user.username} (password saved in .env)`);
  console.log(`   Connection    : ${maskUri(uri)}`);
  if (!connected) console.log('\n   Next: npm run db:check   (after a minute, for DNS)');
  console.log(`   Then: ${process.argv.includes('--seed') ? 'npm run dev' : 'npm run seed && npm run dev'}\n`);
  process.exit(0);
})().catch((error) => {
  console.error(`\n\u001b[31m✗ Atlas setup failed:\u001b[0m ${error.message}\n`);
  if (error.status === 401) {
    console.error('  Check the public/private key pair and that 0.0.0.0/0 is in the API key access list.\n');
  }
  if (error.status === 403) {
    console.error('  The key is valid but lacks permission — it needs the Organization Owner role.\n');
  }
  process.exit(1);
});
