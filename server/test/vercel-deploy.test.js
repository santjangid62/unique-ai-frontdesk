/**
 * Offline test for `npm run deploy`.
 *
 *   npm run test:deploy
 *
 * A local mock of the Vercel REST API (project lookup/create, repo link, env
 * upsert, deployment polling, build events) plus a mock of the deployed app
 * (health, SPA, login, leads, widget) let the whole flow run without a token,
 * network access or a database.
 */
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEPLOY = path.join(ROOT, 'server/src/scripts/deploy.js');
const TOKEN = 'mock_token_1234567890abcdef';
const JWT_ACCESS = 'a'.repeat(96);
const JWT_REFRESH = 'b'.repeat(96);
const MONGO = 'mongodb+srv://mock:secret@cluster0.mock.mongodb.net/unique-frontdesk';

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

const listen = (server) =>
  new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });

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

/** The deployed application, as the post-deploy checks see it. */
async function startAppMock({ mode = 'ok' } = {}) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const json = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const authorized = Boolean(req.headers.authorization);

    if (url.pathname === '/api/health') {
      return json(200, {
        success: true,
        data: {
          status: mode === 'ok' ? 'ok' : 'degraded',
          db: mode === 'ok' ? 'connected' : 'disconnected',
          dbConfigured: mode === 'ok',
        },
      });
    }
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end('<!doctype html><html><body><div id="root"></div><script src="/assets/index.js"></script></body></html>');
    }
    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      const body = await readBody(req);
      if (mode !== 'ok') return json(503, { success: false, error: { code: 'DB_NOT_CONFIGURED' } });
      if (body.password !== 'Owner@12345') return json(401, { success: false, error: { code: 'INVALID_CREDENTIALS' } });
      return json(200, {
        success: true,
        data: { accessToken: 'mock-access-token', tenant: { slug: 'unique-computers' }, user: { email: body.email } },
      });
    }
    if (url.pathname === '/api/auth/me') {
      if (!authorized) return json(401, { success: false });
      return json(200, { success: true, data: { user: { email: 'owner@uniquecomputers.in', role: 'business_admin' } } });
    }
    if (url.pathname === '/api/leads') {
      if (!authorized) return json(401, { success: false, error: { code: 'UNAUTHORIZED' } });
      return json(200, { success: true, data: [] });
    }
    if (url.pathname === '/api/public/widget/unique-computers/config') {
      return json(200, { success: true, data: { businessName: 'Unique Computers' } });
    }
    return json(404, { success: false });
  });

  const url = await listen(server);
  return { url, close: () => new Promise((done) => server.close(done)) };
}

/** Mock Vercel REST API. */
async function startVercelMock({ appUrl, states = ['READY'], buildLog = [] }) {
  const state = { project: null, projectCreated: 0, linkCalls: 0, envPosts: [], deploymentPosts: [], polls: 0, eventCalls: 0 };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const json = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const body = ['POST', 'PATCH'].includes(req.method) ? await readBody(req) : {};
    const parts = url.pathname.split('/').filter(Boolean);

    if (req.method === 'GET' && url.pathname === '/v2/user') {
      return json(200, { user: { username: 'mock-user', email: 'mock@example.com' } });
    }

    if (url.pathname === '/v10/projects' && req.method === 'POST') {
      state.projectCreated += 1;
      state.project = { id: 'prj_mock', name: body.name, framework: body.framework ?? null };
      return json(200, state.project);
    }

    if (parts[0] === 'v9' && parts[1] === 'projects') {
      if (req.method === 'GET' && parts.length === 3) {
        return state.project
          ? json(200, state.project)
          : json(404, { error: { code: 'not_found', message: 'The project could not be found' } });
      }
      if (req.method === 'POST' && parts[3] === 'link') {
        state.linkCalls += 1;
        state.project = { ...state.project, link: { type: 'github', repoId: '999', org: 'santjangid62', repo: 'unique-ai-frontdesk' } };
        return json(200, { project: state.project });
      }
    }

    if (/^\/v10\/projects\/[^/]+\/env$/.test(url.pathname) && req.method === 'POST') {
      state.envPosts.push({ key: body.key, target: body.target, type: body.type });
      return json(201, { created: body.key });
    }

    if (url.pathname === '/v13/deployments' && req.method === 'POST') {
      state.deploymentPosts.push(body);
      return json(200, { id: 'dpl_mock', readyState: 'QUEUED', url: 'unique-ai-frontdesk-mock.vercel.app' });
    }

    if (url.pathname === '/v13/deployments/dpl_mock' && req.method === 'GET') {
      const index = Math.min(state.polls, states.length - 1);
      const readyState = states[index];
      state.polls += 1;
      if (readyState === 'READY') {
        return json(200, { id: 'dpl_mock', readyState, url: appUrl, alias: [] });
      }
      return json(200, { id: 'dpl_mock', readyState });
    }

    if (url.pathname === '/v3/deployments/dpl_mock/events') {
      state.eventCalls += 1;
      return json(200, buildLog.map((text) => ({ payload: { text } })));
    }

    return json(404, { error: { code: 'not_found', message: `unhandled ${req.method} ${req.url}` } });
  });

  const url = await listen(server);
  return { state, url, close: () => new Promise((done) => server.close(done)) };
}

function runDeploy(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [DEPLOY, '--skip-seed'], {
      cwd: ROOT,
      env: {
        ...process.env,
        VERCEL_TOKEN: TOKEN,
        VERCEL_API_BASE: env.VERCEL_API_BASE,
        JWT_ACCESS_SECRET: JWT_ACCESS,
        JWT_REFRESH_SECRET: JWT_REFRESH,
        MONGODB_URI: env.MONGODB_URI ?? '',
      },
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('exit', (code) => resolve({ code, output }));
  });
}

(async () => {
  console.log('\ndeploy against a local mock Vercel API\n');

  console.log('Scenario 1 — first deploy, build succeeds, app healthy');
  {
    const app = await startAppMock();
    const vercel = await startVercelMock({ appUrl: app.url, states: ['QUEUED', 'BUILDING', 'READY'] });
    const { code, output } = await runDeploy({ VERCEL_API_BASE: vercel.url, MONGODB_URI: MONGO });

    check('deploy exits 0', code === 0, output.slice(-400));
    check('created the project', vercel.state.projectCreated === 1, `created=${vercel.state.projectCreated}`);
    check('linked the GitHub repository', vercel.state.linkCalls === 1 && /Repository linked: santjangid62\/unique-ai-frontdesk/.test(output));
    check(
      'upserted all four env vars',
      ['MONGODB_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'NODE_ENV'].every((key) => vercel.state.envPosts.some((entry) => entry.key === key)),
      vercel.state.envPosts.map((entry) => entry.key).join(','),
    );
    check('env vars target production and preview', vercel.state.envPosts.every((entry) => entry.target?.includes('production') && entry.target?.includes('preview')));
    check('deployed from the linked repo', vercel.state.deploymentPosts[0]?.gitSource?.repoId === '999' && vercel.state.deploymentPosts[0]?.gitSource?.ref === 'main');
    check('targeted production', vercel.state.deploymentPosts[0]?.target === 'production');
    check('polled until READY', vercel.state.polls >= 3 && /READY/.test(output), `polls=${vercel.state.polls}`);
    check('reported the build states', /BUILDING/.test(output) && /READY/.test(output));
    check('all live checks passed', /9\/9 checks passed/.test(output), output.slice(-400));
    check('verified the app URL from the deployment', output.includes(`Live URL   : ${app.url}`), app.url);
    check('finished cleanly', /Deployment is live and verified/.test(output));

    await vercel.close();
    await app.close();
  }

  console.log('\nScenario 2 — app is up but the database is not connected');
  {
    const app = await startAppMock({ mode: 'degraded' });
    const vercel = await startVercelMock({ appUrl: app.url, states: ['BUILDING', 'READY'] });
    const { code, output } = await runDeploy({ VERCEL_API_BASE: vercel.url, MONGODB_URI: undefined });

    check('deploy exits 1', code === 1, output.slice(-400));
    check('detects the disconnected database', /db=disconnected/.test(output), output.slice(-400));
    check('lists the failed checks', /live check\(s\) failed/.test(output));
    check('skips the empty MONGODB_URI instead of clearing it', /MONGODB_URI skipped \(empty\)/.test(output) && !vercel.state.envPosts.some((entry) => entry.key === 'MONGODB_URI'));

    await vercel.close();
    await app.close();
  }

  console.log('\nScenario 3 — the build fails');
  {
    const app = await startAppMock();
    const vercel = await startVercelMock({
      appUrl: app.url,
      states: ['BUILDING', 'ERROR'],
      buildLog: ['Installing dependencies...', 'Error: Module not found: can\'t resolve ./missing'],
    });
    const { code, output } = await runDeploy({ VERCEL_API_BASE: vercel.url, MONGODB_URI: MONGO });

    check('deploy exits 1', code === 1, output.slice(-400));
    check('reports the failed build state', /Deployment finished with state ERROR/.test(output));
    check('shows the build log tail', /Module not found/.test(output), output.slice(-400));
    check('fetched the build events', vercel.state.eventCalls >= 1);

    await vercel.close();
    await app.close();
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error('Test crashed:', error);
  process.exit(1);
});
