/**
 * Shared plumbing for the mock-API tests (test:atlas, test:deploy).
 */
import { spawn } from 'node:child_process';

/** PASS/FAIL counter with a summary line. */
export function createChecker() {
  const counters = { passed: 0, failed: 0 };

  const check = (label, condition, detail = '') => {
    if (condition) {
      counters.passed += 1;
      console.log(`  PASS  ${label}`);
      return;
    }
    counters.failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ''}`);
  };

  return {
    check,
    summary: () => `\n  ${counters.passed} passed, ${counters.failed} failed\n`,
    exitCode: () => (counters.failed ? 1 : 0),
  };
}

/** Starts a server on an ephemeral port and resolves its base URL. */
export const listen = (server) =>
  new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });

/** Reads a JSON request body (empty object when absent or invalid). */
export const readBody = (req) =>
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

/** Writes a JSON response. */
export function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

/** Runs a project script with a merged environment, capturing stdout+stderr. */
export function runNode(script, { args = [], env = {}, cwd } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, env: { ...process.env, ...env } });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('exit', (code) => resolve({ code: code ?? 1, output }));
    child.on('error', (error) => resolve({ code: 1, output: `${output}\n${error.message}` }));
  });
}
