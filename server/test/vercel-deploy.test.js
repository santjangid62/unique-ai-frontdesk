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
import { fileURLToPath } from 'node:url';
import { createChecker, listen, readBody, sendJson, runNode } from './helpers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEPLOY = path.join(ROOT, 'server/src/scripts/deploy.js');
const TOKEN = 'mock_token_1234567890abcdef';
const JWT_ACCESS = 'a'.repeat(96);
const JWT_REFRESH = 'b'.repeat(96);
const MONGO = 'mongodb+srv://mock:secret@cluster0.mock.mongodb.net/unique-frontdesk';

const { check, summary, exitCode } = createChecker();

/** The deployed application, as the post-deploy checks see it. */
async function startAppMock({ mode = 'ok' } = {}) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const authorized = Boolean(req.headers.authorization);

    if (url.pathname === '/api/health') {
      const healthy = mode === 'ok';
      // Mirrors the real CORS middleware: echo an allowed origin back.
      const headers = req.headers.origin ? { 'Access-Control-Allow-Origin': req.headers.origin } : {};
      return sendJson(
        res,
        200,
        {
          success: true,
          data: { status: healthy ? 'ok' : 'degraded', db: healthy ? 'connected' : 'disconnected', dbConfigured: healthy },
        },
        headers,
      );
    }
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end('<!doctype html><html><body><div id="root"></div><script src="/assets/index.js"></script></body></html>');
    }
    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      const body = await readBody(req);
      if (mode !== 'ok') return sendJson(res, 503, { success: false, error: { code: 'DB_NOT_CONFIGURED' } });
      if (body.password !== 'Owner@12345') return sendJson(res, 401, { success: false, error: { code: 'INVALID_CREDENTIALS' } });
      return sendJson(res, 200, {
        success: true,
        data: { accessToken: 'mock-access-token', tenant: { slug: 'unique-computers' }, user: { email: body.email } },
      });
    }
    if (url.pathname === '/api/auth/me') {
      if (!authorized) return sendJson(res, 401, { success: false });
      return sendJson(res, 200, { success: true, data: { user: { email: 'owner@uniquecomputers.in', role: 'business_admin' } } });
    }
    if (url.pathname === '/api/leads') {
      if (!authorized) return sendJson(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
      return sendJson(res, 200, { success: true, data: [] });
    }
    if (url.pathname === '/api/public/widget/unique-computers/config') {
      return sendJson(res, 200, { success: true, data: { businessName: 'Unique Computers' } });
    }
    return sendJson(res, 404, { success: false });
  });

  const url = await listen(server);
  return { url, close: () => new Promise((done) => server.close(done)) };
}

/** Mock Vercel REST API. */
async function startVercelMock({ appUrl, states = ['READY'], buildLog = [], linkError = null, tokenStatus = 200 }) {
  const state = { project: null, projectCreated: 0, linkCalls: 0, envPosts: [], deploymentPosts: [], polls: 0, eventCalls: 0 };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const body = ['POST', 'PATCH'].includes(req.method) ? await readBody(req) : {};
    const parts = url.pathname.split('/').filter(Boolean);

    if (req.method === 'GET' && url.pathname === '/v2/user') {
      if (tokenStatus !== 200) {
        const code = tokenStatus === 401 ? 'unauthorized' : 'forbidden';
        const message = tokenStatus === 401 ? 'Invalid token' : 'Not authorized';
        return sendJson(res, tokenStatus, { error: { code, message, invalidToken: true } });
      }
      return sendJson(res, 200, { user: { username: 'mock-user', email: 'mock@example.com' } });
    }

    if (url.pathname === '/v10/projects' && req.method === 'POST') {
      state.projectCreated += 1;
      state.project = { id: 'prj_mock', name: body.name, framework: body.framework ?? null };
      return sendJson(res, 200, state.project);
    }

    if (parts[0] === 'v9' && parts[1] === 'projects') {
      if (req.method === 'GET' && parts.length === 3) {
        return state.project
          ? sendJson(res, 200, state.project)
          : sendJson(res, 404, { error: { code: 'not_found', message: 'The project could not be found' } });
      }
      if (req.method === 'POST' && parts[3] === 'link') {
        state.linkCalls += 1;
        if (linkError) return sendJson(res, 403, { error: { code: 'forbidden', message: linkError } });
        state.project = { ...state.project, link: { type: 'github', repoId: '999', org: 'santjangid62', repo: 'unique-ai-frontdesk' } };
        return sendJson(res, 200, { project: state.project });
      }
    }

    if (/^\/v10\/projects\/[^/]+\/env$/.test(url.pathname) && req.method === 'POST') {
      state.envPosts.push({ key: body.key, value: body.value, target: body.target, type: body.type });
      return sendJson(res, 201, { created: body.key });
    }

    if (url.pathname === '/v13/deployments' && req.method === 'POST') {
      state.deploymentPosts.push(body);
      return sendJson(res, 200, { id: 'dpl_mock', readyState: 'QUEUED', url: 'unique-ai-frontdesk-mock.vercel.app' });
    }

    if (url.pathname === '/v13/deployments/dpl_mock' && req.method === 'GET') {
      const readyState = states[Math.min(state.polls, states.length - 1)];
      state.polls += 1;
      return sendJson(res, 200, readyState === 'READY' ? { id: 'dpl_mock', readyState, url: appUrl, alias: [] } : { id: 'dpl_mock', readyState });
    }

    if (url.pathname === '/v3/deployments/dpl_mock/events') {
      state.eventCalls += 1;
      return sendJson(res, 200, buildLog.map((text) => ({ payload: { text } })));
    }

    return sendJson(res, 404, { error: { code: 'not_found', message: `unhandled ${req.method} ${req.url}` } });
  });

  const url = await listen(server);
  return { state, url, close: () => new Promise((done) => server.close(done)) };
}

const runDeploy = ({ apiBase, mongoUri }) =>
  runNode(DEPLOY, {
    cwd: ROOT,
    args: ['--skip-seed', '--skip-preflight'],
    env: {
      VERCEL_TOKEN: TOKEN,
      VERCEL_API_BASE: apiBase,
      JWT_ACCESS_SECRET: JWT_ACCESS,
      JWT_REFRESH_SECRET: JWT_REFRESH,
      MONGODB_URI: mongoUri ?? '',
    },
  });

(async () => {
  console.log('\ndeploy against a local mock Vercel API\n');

  console.log('Scenario 1 — first deploy, build succeeds, app healthy');
  {
    const app = await startAppMock();
    const vercel = await startVercelMock({ appUrl: app.url, states: ['QUEUED', 'BUILDING', 'READY'] });
    const { code, output } = await runDeploy({ apiBase: vercel.url, mongoUri: MONGO });

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
    check('all live checks passed', /10\/10 checks passed/.test(output), output.slice(-400));
    check(
      'set CLIENT_ORIGIN and APP_URL to the production URL',
      ['CLIENT_ORIGIN', 'APP_URL'].every((key) =>
        vercel.state.envPosts.some((entry) => entry.key === key && entry.value === 'https://unique-ai-frontdesk.vercel.app'),
      ),
      vercel.state.envPosts.map((entry) => `${entry.key}=${entry.value}`).join(','),
    );
    check('verified the app URL from the deployment', output.includes(`Live URL   : ${app.url}`), app.url);
    check('finished cleanly', /Deployment is live and verified/.test(output));

    await vercel.close();
    await app.close();
  }

  console.log('\nScenario 2 — app is up but the database is not connected');
  {
    const app = await startAppMock({ mode: 'degraded' });
    const vercel = await startVercelMock({ appUrl: app.url, states: ['BUILDING', 'READY'] });
    const { code, output } = await runDeploy({ apiBase: vercel.url });

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
      buildLog: ['Installing dependencies...', "Error: Module not found: can't resolve ./missing"],
    });
    const { code, output } = await runDeploy({ apiBase: vercel.url, mongoUri: MONGO });

    check('deploy exits 1', code === 1, output.slice(-400));
    check('reports the failed build state', /Deployment finished with state ERROR/.test(output));
    check('shows the build log tail', /Module not found/.test(output), output.slice(-400));
    check('fetched the build events', vercel.state.eventCalls >= 1);

    await vercel.close();
    await app.close();
  }

  console.log('\nScenario 4 — the repository cannot be linked');
  {
    const app = await startAppMock();
    const vercel = await startVercelMock({ appUrl: app.url, linkError: 'GitHub app is not installed for this repository' });
    const { code, output } = await runDeploy({ apiBase: vercel.url, mongoUri: MONGO });

    check('deploy exits 1', code === 1, output.slice(-400));
    check('explains the missing repository link', /is not linked to the Vercel project/.test(output), output.slice(-400));
    check('does not start a deployment', vercel.state.deploymentPosts.length === 0);

    await vercel.close();
    await app.close();
  }

  console.log('\nScenario 5 — verify-only run with --skip-deploy --url');
  {
    const app = await startAppMock();
    const { code, output } = await runNode(DEPLOY, {
      cwd: ROOT,
      args: ['--skip-deploy', '--skip-seed', '--url', app.url],
      env: { VERCEL_TOKEN: '', JWT_ACCESS_SECRET: JWT_ACCESS, JWT_REFRESH_SECRET: JWT_REFRESH, MONGODB_URI: '' },
    });

    check('runs without a Vercel token', !/No Vercel token/.test(output), output.slice(-300));
    check('verifies the URL given on the command line', /Skipping deploy, verifying/.test(output) && output.includes(`Live URL   : ${app.url}`));
    check('all live checks passed', /10\/10 checks passed/.test(output), output.slice(-400));
    check('exits 0', code === 0, output.slice(-400));

    await app.close();
  }

  console.log('\nScenario 6 — a local MongoDB URI blocks the deploy');
  {
    const vercel = await startVercelMock({ appUrl: 'https://example.vercel.app' });
    const { code, output } = await runDeploy({
      apiBase: vercel.url,
      mongoUri: 'mongodb://127.0.0.1:27017/unique-frontdesk',
    });

    check('deploy exits 1', code === 1, output.slice(-400));
    check('explains Vercel cannot reach a local database', /Vercel cannot reach/.test(output), output.slice(-400));
    check(
      'shows the Atlas setup steps',
      /cloud\.mongodb\.com/.test(output) && /0\.0\.0\.0\/0/.test(output) && /mongodb\+srv/.test(output),
      output.slice(-400),
    );
    check('does not touch the Vercel project', vercel.state.projectCreated === 0 && vercel.state.deploymentPosts.length === 0);

    await vercel.close();
  }

  console.log('\nScenario 7 — --dry-run checks everything and changes nothing');
  {
    const vercel = await startVercelMock({ appUrl: 'https://example.vercel.app' });
    const { code, output } = await runNode(DEPLOY, {
      cwd: ROOT,
      args: ['--skip-seed', '--skip-preflight', '--dry-run'],
      env: {
        VERCEL_TOKEN: TOKEN,
        VERCEL_API_BASE: vercel.url,
        JWT_ACCESS_SECRET: JWT_ACCESS,
        JWT_REFRESH_SECRET: JWT_REFRESH,
        MONGODB_URI: MONGO,
      },
    });

    check('dry run exits 0', code === 0, output.slice(-400));
    check('says nothing was changed', /nothing was changed/i.test(output) && /Remove --dry-run/.test(output), output.slice(-400));
    check(
      'does not create the project, set env vars or deploy',
      vercel.state.projectCreated === 0 && vercel.state.envPosts.length === 0 && vercel.state.deploymentPosts.length === 0,
    );

    await vercel.close();
  }

  console.log('\nScenario 8 — Vercel rejects the token with 401/403');
  for (const status of [401, 403]) {
    const vercel = await startVercelMock({ appUrl: 'https://example.vercel.app', tokenStatus: status });
    const { code, output } = await runDeploy({ apiBase: vercel.url, mongoUri: MONGO });

    check(`${status}: deploy exits 1`, code === 1, output.slice(-400));
    check(
      `${status}: explains how to replace the token`,
      /Vercel rejected the token/.test(output) && /vercel\.com\/account\/tokens/.test(output) && /deploy-token\.txt/.test(output),
      output.slice(-400),
    );
    check(
      `${status}: hides the raw Vercel API error`,
      !/Not authorized/.test(output) && !/Invalid token/.test(output) && !/\/v2\/user/.test(output) && !/invalidToken/.test(output),
      output.slice(-400),
    );
    check(
      `${status}: stops before touching the project`,
      vercel.state.projectCreated === 0 && vercel.state.envPosts.length === 0 && vercel.state.deploymentPosts.length === 0,
    );

    await vercel.close();
  }

  console.log(summary());
  process.exit(exitCode());
})().catch((error) => {
  console.error('Test crashed:', error);
  process.exit(1);
});
