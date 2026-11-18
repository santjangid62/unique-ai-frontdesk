/**
 * Offline test for the Atlas setup script.
 *
 *   npm run test:atlas
 *
 * Starts a local mock of the Atlas Admin API that speaks HTTP Digest, expires
 * the first nonce (stale=true), validates the M0 payload and serves the
 * endpoints the script uses. The real script is then run against it, so digest
 * auth, the stale-nonce retry, cluster reuse and the .env write are exercised
 * without any Atlas keys or network access.
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(ROOT, 'server/src/scripts/atlas-setup.js');
const PUBLIC_KEY = 'mockpublickey1';
const PRIVATE_KEY = '3f1c2b7d-1111-2222-3333-444455556666';
const REALM = 'MMS Public API';
const BASE_PATH = '/api/atlas/v1.0';

const md5 = (value) => crypto.createHash('md5').update(value).digest('hex');

let passed = 0;
let failed = 0;
const check = (label, condition, detail = '') => {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ''}`);
  }
};

function startMock({ clusters = [], project = null } = {}) {
  const state = {
    nonces: new Map(),
    staleIssued: 0,
    clusterPosts: [],
    clusters: clusters.map((cluster) => ({ ...cluster })),
    project,
    user: null,
    accessListPosts: 0,
    orgCalls: 0,
    projectPosts: 0,
  };

  const issueNonce = (stale = false) => {
    const nonce = crypto.randomBytes(8).toString('hex');
    state.nonces.set(nonce, { stale });
    return nonce;
  };

  const challenge = (nonce, stale) =>
    `Digest realm="${REALM}", domain="", nonce="${nonce}", algorithm=MD5, qop="auth", stale=${stale ? 'true' : 'false'}`;

  const verify = (req, header) => {
    const parts = {};
    for (const match of header.slice(7).matchAll(/([a-z]+)=(?:"([^"]*)"|([^,]*))/gi)) {
      parts[match[1].toLowerCase()] = match[2] ?? match[3];
    }
    if (parts.username !== PUBLIC_KEY) return { ok: false, reason: 'wrong username' };
    if (!state.nonces.has(parts.nonce)) return { ok: false, reason: 'unknown nonce' };
    if (parts.uri !== req.url) return { ok: false, reason: `uri mismatch (${parts.uri} vs ${req.url})` };

    const ha1 = md5(`${PUBLIC_KEY}:${REALM}:${PRIVATE_KEY}`);
    const ha2 = md5(`${req.method}:${parts.uri}`);
    const expected = parts.qop
      ? md5(`${ha1}:${parts.nonce}:${parts.nc}:${parts.cnonce}:${parts.qop}:${ha2}`)
      : md5(`${ha1}:${parts.nonce}:${ha2}`);
    if (parts.response !== expected) return { ok: false, reason: 'wrong response hash' };
    return { ok: true, stale: state.nonces.get(parts.nonce).stale };
  };

  const readBody = (req) =>
    new Promise((resolve) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch {
          resolve({});
        }
      });
    });

  const server = http.createServer(async (req, res) => {
    const send = (status, body, headers = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
      res.end(JSON.stringify(body));
    };

    const authorization = req.headers.authorization || '';
    if (!authorization.startsWith('Digest ')) {
      return send(401, { detail: 'auth required' }, { 'WWW-Authenticate': challenge(issueNonce(state.nonces.size === 0), false) });
    }

    const verdict = verify(req, authorization);
    if (!verdict.ok) {
      return send(401, { detail: `bad digest: ${verdict.reason}` }, { 'WWW-Authenticate': challenge(issueNonce(false), false) });
    }
    if (verdict.stale) {
      state.staleIssued += 1;
      return send(401, { detail: 'nonce expired' }, { 'WWW-Authenticate': challenge(issueNonce(false), true) });
    }

    const route = req.url.replace(BASE_PATH, '').split('?')[0];
    const segments = route.split('/').filter(Boolean);
    const body = ['POST', 'PATCH', 'PUT'].includes(req.method) ? await readBody(req) : {};

    if (req.method === 'GET' && route === '/orgs') {
      state.orgCalls += 1;
      return send(200, { results: [{ id: 'org1', name: 'Mock Org' }] });
    }
    if (req.method === 'GET' && route === '/orgs/org1/groups') {
      return send(200, { results: state.project ? [state.project] : [] });
    }
    if (req.method === 'POST' && route === '/groups') {
      state.projectPosts += 1;
      state.project = { id: 'proj1', name: body.name };
      return send(201, state.project);
    }
    if (req.method === 'GET' && segments.length === 2 && segments[0] === 'groups') {
      return state.project && segments[1] === state.project.id
        ? send(200, state.project)
        : send(404, { detail: 'project not found' });
    }
    if (req.method === 'GET' && route === '/groups/proj1/clusters') {
      return send(200, { results: state.clusters });
    }
    if (req.method === 'POST' && route === '/groups/proj1/clusters') {
      state.clusterPosts.push(body);
      if ('diskSizeGB' in body) {
        return send(400, { detail: 'diskSizeGB is not configurable on M0 clusters' });
      }
      if (body.replicationSpecs) {
        return send(400, { detail: 'replicationSpecs fallback should not be used' });
      }
      if (body.providerSettings?.instanceSizeName !== 'M0') {
        return send(400, { detail: 'expected providerSettings.instanceSizeName=M0' });
      }
      const cluster = {
        name: body.name,
        providerSettings: body.providerSettings,
        stateName: 'IDLE',
        connectionStrings: { standardSrv: `mongodb+srv://${body.name.toLowerCase()}.mock.mongodb.net` },
      };
      state.clusters.push(cluster);
      return send(201, cluster);
    }
    if (req.method === 'GET' && segments[0] === 'groups' && segments[2] === 'clusters' && segments[3]) {
      const cluster = state.clusters.find((item) => item.name === segments[3]);
      return cluster ? send(200, cluster) : send(404, { detail: 'cluster not found' });
    }
    if (segments[0] === 'groups' && segments[2] === 'databaseUsers') {
      if (req.method === 'GET') return state.user ? send(200, state.user) : send(404, { detail: 'user not found' });
      if (req.method === 'POST') {
        state.user = { username: body.username, password: body.password, roles: body.roles };
        return send(201, state.user);
      }
      if (req.method === 'PATCH') {
        state.user = { ...(state.user || {}), password: body.password, roles: body.roles };
        return send(200, state.user);
      }
    }
    if (req.method === 'POST' && segments[0] === 'groups' && segments[2] === 'accessList') {
      state.accessListPosts += 1;
      return send(200, { results: (body || []).map((entry) => ({ ...entry, status: 'IN_PROGRESS' })) });
    }

    return send(404, { detail: `unhandled ${req.method} ${req.url}` });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ state, url: `http://127.0.0.1:${port}`, close: () => new Promise((done) => server.close(done)) });
    });
  });
}

function runSetup(mockUrl, envFile, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, '--no-verify'], {
      cwd: ROOT,
      env: {
        ...process.env,
        ATLAS_PUBLIC_KEY: PUBLIC_KEY,
        ATLAS_PRIVATE_KEY: PRIVATE_KEY,
        ATLAS_API_BASE: `${mockUrl}${BASE_PATH}`,
        ATLAS_ENV_PATH: envFile,
        ATLAS_REGION: 'AP_SOUTH_1',
        ATLAS_PROJECT_NAME: 'unique-ai-frontdesk',
        ATLAS_PROJECT_ID: '',
        ...extraEnv,
      },
    });

    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('exit', (code) => resolve({ code, output }));
  });
}

const tempEnvFile = ({ withJwt = true } = {}) => {
  const file = path.join(os.tmpdir(), `atlas-env-${crypto.randomBytes(4).toString('hex')}.env`);
  const jwt = withJwt ? 'JWT_ACCESS_SECRET=test\nJWT_REFRESH_SECRET=test\n' : 'JWT_ACCESS_SECRET=\nJWT_REFRESH_SECRET=\n';
  fs.writeFileSync(file, `MONGODB_URI=\n${jwt}`);
  return file;
};

(async () => {
  console.log('\nAtlas setup against a local mock API\n');

  console.log('Scenario 1 — project already has a free cluster under another name');
  {
    const mock = await startMock({
      clusters: [
        {
          name: 'SharedFreeCluster',
          providerSettings: { providerName: 'AWS', regionName: 'AP_SOUTH_1', instanceSizeName: 'M0' },
          stateName: 'IDLE',
          connectionStrings: { standardSrv: 'mongodb+srv://sharedfreecluster.mock.mongodb.net' },
        },
      ],
    });
    const envFile = tempEnvFile();
    const { code, output } = await runSetup(mock.url, envFile);
    const env = fs.readFileSync(envFile, 'utf8');

    check('setup exits 0', code === 0, output.slice(-300));
    check('reuses the existing free cluster by tier, not name', /Reusing existing free cluster "SharedFreeCluster"/.test(output), output.slice(-300));
    check('no cluster was created', mock.state.clusterPosts.length === 0, `${mock.state.clusterPosts.length} POST(s)`);
    check('digest stale nonce was retried', mock.state.staleIssued >= 1, `staleIssued=${mock.state.staleIssued}`);
    check('wrote the reused cluster URI to the env file', /MONGODB_URI=mongodb\+srv:\/\/unique_admin:[^@]+@sharedfreecluster\.mock\.mongodb\.net\/unique-frontdesk/.test(env), env.split('\n')[0]);
    check('created the database user and access list', Boolean(mock.state.user) && mock.state.accessListPosts > 0);

    await mock.close();
    fs.unlinkSync(envFile);
  }

  console.log('\nScenario 2 — empty project, M0 payload is sent');
  {
    const mock = await startMock({ clusters: [] });
    const envFile = tempEnvFile();
    const { code, output } = await runSetup(mock.url, envFile);
    const env = fs.readFileSync(envFile, 'utf8');
    const payload = mock.state.clusterPosts[0] || {};

    check('setup exits 0', code === 0, output.slice(-300));
    check('requested a new M0 cluster', /Requested M0 in AP_SOUTH_1/.test(output), output.slice(-300));
    check('payload has no diskSizeGB', !('diskSizeGB' in payload), JSON.stringify(payload));
    check('payload uses providerSettings M0', payload.providerSettings?.instanceSizeName === 'M0', JSON.stringify(payload));
    check('payload has no replicationSpecs fallback', !payload.replicationSpecs, JSON.stringify(payload));
    check('wrote the new cluster URI to the env file', /MONGODB_URI=mongodb\+srv:\/\/unique_admin:[^@]+@cluster0\.mock\.mongodb\.net\/unique-frontdesk/.test(env), env.split('\n')[0]);
    check('digest auth succeeded after the stale nonce', mock.state.staleIssued >= 1 && code === 0);

    await mock.close();
    fs.unlinkSync(envFile);
  }

  console.log('\nScenario 3 — project-scoped key with ATLAS_PROJECT_ID');
  {
    const mock = await startMock({ clusters: [], project: { id: 'proj1', name: 'Mock Project' } });
    const envFile = tempEnvFile({ withJwt: false });
    const { code, output } = await runSetup(mock.url, envFile, { ATLAS_PROJECT_ID: 'proj1' });
    const env = fs.readFileSync(envFile, 'utf8');

    check('setup exits 0', code === 0, output.slice(-300));
    check('uses the given project id', /Using "Mock Project" \(proj1\) with a project-scoped key/.test(output), output.slice(-300));
    check('never lists organizations', mock.state.orgCalls === 0, `orgCalls=${mock.state.orgCalls}`);
    check('never creates a project', mock.state.projectPosts === 0, `projectPosts=${mock.state.projectPosts}`);
    check('still creates the M0 cluster', mock.state.clusterPosts.length === 1, `${mock.state.clusterPosts.length} POST(s)`);
    check('wrote the connection string', /MONGODB_URI=mongodb\+srv:\/\/unique_admin:[^@]+@cluster0\.mock\.mongodb\.net/.test(env), env.split('\n')[0]);
    check('generated JWT_ACCESS_SECRET', /^JWT_ACCESS_SECRET=[0-9a-f]{96}$/m.test(env), env.match(/^JWT_ACCESS_SECRET=.*$/m)?.[0]?.slice(0, 30));
    check('generated JWT_REFRESH_SECRET', /^JWT_REFRESH_SECRET=[0-9a-f]{96}$/m.test(env), env.match(/^JWT_REFRESH_SECRET=.*$/m)?.[0]?.slice(0, 30));

    await mock.close();
    fs.unlinkSync(envFile);
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error('Test crashed:', error);
  process.exit(1);
});
