/**
 * Keeps the demo logins documented in the setup guide identical to the ones the
 * seed scripts create. Both sides are read as text, so the check runs offline and
 * never touches a database.
 *
 *   npm run test:credentials
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createChecker } from './helpers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GUIDE = path.join(ROOT, 'docs/SETUP-GUIDE.html');
const SEED = path.join(ROOT, 'server/src/scripts/seed.js');
const DEMO_DATA = path.join(ROOT, 'server/src/scripts/demo-data.js');

const { check, summary, exitCode } = createChecker();
const read = (file) => fs.readFileSync(file, 'utf8');

/** email/password pairs of `export const DEMO_CREDENTIALS = { … }`. */
function seedCredentials(source) {
  const block = source.match(/export const DEMO_CREDENTIALS = \{([\s\S]*?)\n\};/);
  if (!block) return [];
  return [...block[1].matchAll(/email: '([^']+)', password: '([^']+)'/g)].map(([, email, password]) => ({
    email,
    password,
  }));
}

/** The tester account created by `npm run demo:data`. */
function testerCredential(source) {
  const block = source.match(/export const TESTER_CREDENTIALS = \{([\s\S]*?)\n\};/);
  if (!block) return null;
  const email = block[1].match(/email: '([^']+)'/)?.[1];
  const password = block[1].match(/password: '([^']+)'/)?.[1];
  return email && password ? { email, password } : null;
}

/** Rows of the demo-login table in the guide's local-run section. */
function guideCredentials(html) {
  const start = html.indexOf('Login के लिए demo accounts');
  if (start === -1) return [];
  const table = html.slice(start, html.indexOf('</table>', start));
  const cells = (row) =>
    [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(([, text]) => text.replace(/<[^>]+>/g, '').trim());

  return [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .map(([, row]) => cells(row))
    .filter((row) => row.length >= 4)
    .map(([role, portal, email, password]) => ({ role, portal, email, password }));
}

const seed = seedCredentials(read(SEED));
const tester = testerCredential(read(DEMO_DATA));
const guide = guideCredentials(read(GUIDE));
const expected = [...seed, ...(tester ? [tester] : [])];

console.log('\nDemo credentials — guide table vs seed scripts');
check('seed.js defines the demo logins', seed.length > 0, `found ${seed.length}`);
check('demo-data.js defines the tester login', Boolean(tester));
check('guide section 7 lists the demo logins', guide.length > 0, `found ${guide.length} rows`);

for (const { email, password } of expected) {
  const row = guide.find((entry) => entry.email === email);
  check(
    `${email} is in the guide with the seeded password`,
    Boolean(row) && row.password === password,
    row ? `guide has ${row.password}` : 'missing from the guide table',
  );
  check(
    `${email} row carries a portal URL`,
    Boolean(row) && /^\/login\//.test(row.portal),
    row ? `portal=${row.portal}` : 'missing',
  );
}

const documented = guide.map((entry) => entry.email);
const undocumented = documented.filter((email) => !expected.some((entry) => entry.email === email));
check('the guide documents no account the seed does not create', undocumented.length === 0, undocumented.join(', '));
check('the guide table has no duplicate accounts', new Set(documented).size === documented.length, documented.join(', '));

console.log(summary());
process.exit(exitCode());
