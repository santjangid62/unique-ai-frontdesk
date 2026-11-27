/**
 * Offline test for the preview database guard.
 *
 *   npm run test:preview-guard
 *
 * A Vercel preview deployment must never open the production database, even if
 * the production MONGODB_URI is pasted into the Preview environment. No network
 * or database is needed: the guard rejects the URI before mongoose connects.
 */
import fs from 'node:fs';
import { createChecker, runNode } from './helpers.js';
import { mongoUriDbName, previewDbProblem, PRODUCTION_DB_NAME } from '../src/config/env.js';

const { check, summary, exitCode } = createChecker();

const PROD_URI =
  'mongodb+srv://unique_admin:secret@cluster0.idefczg.mongodb.net/unique-frontdesk?retryWrites=true&w=majority';
const PREVIEW_URI =
  'mongodb+srv://unique_admin:secret@cluster0.idefczg.mongodb.net/unique-frontdesk-preview?retryWrites=true&w=majority';

console.log('\n  preview database guard');

check('production database name is unique-frontdesk', PRODUCTION_DB_NAME === 'unique-frontdesk');
check('parses the database name from a URI', mongoUriDbName(PROD_URI) === 'unique-frontdesk', mongoUriDbName(PROD_URI));
check(
  'parses a URI without a query string',
  mongoUriDbName('mongodb://localhost:27017/unique-frontdesk') === 'unique-frontdesk',
  mongoUriDbName('mongodb://localhost:27017/unique-frontdesk'),
);
check(
  'returns an empty name when the URI names no database',
  mongoUriDbName('mongodb+srv://u:p@cluster0.example.mongodb.net/?retryWrites=true') === '',
);

check('blocks the production database on a preview deployment', Boolean(previewDbProblem(PROD_URI, 'preview')));
check(
  'names the production database in the message',
  /unique-frontdesk/.test(previewDbProblem(PROD_URI, 'preview') || ''),
);
check('allows a separate preview database', previewDbProblem(PREVIEW_URI, 'preview') === null);
check('allows the production database in production', previewDbProblem(PROD_URI, 'production') === null);
check('allows the production database outside Vercel', previewDbProblem(PROD_URI, undefined) === null);
check(
  'compares the database name case-insensitively',
  Boolean(previewDbProblem('mongodb+srv://u:p@cluster0.example.mongodb.net/Unique-Frontdesk', 'PREVIEW')),
);

// connectDB must refuse before mongoose opens a socket.
process.env.VERCEL_ENV = 'preview';
const { connectDB, dbState } = await import('../src/config/db.js');
const refused = await connectDB(PROD_URI).then(
  () => null,
  (error) => error,
);
check('connectDB refuses the production database', refused?.code === 'PREVIEW_PRODUCTION_DB', refused?.message || 'connected anyway');
check('no connection was opened', dbState() === 'disconnected', dbState());
delete process.env.VERCEL_ENV;

// Maintenance scripts must connect through connectDB() as well, so the guard
// cannot be bypassed by a direct mongoose.connect().
const source = (name) => fs.readFileSync(new URL(`../src/scripts/${name}`, import.meta.url), 'utf8');
for (const name of ['reset-demo.js', 'smoke-cleanup.js']) {
  const script = source(name);
  check(`${name} imports connectDB`, /import \{[^}]*connectDB[^}]*\} from '\.\.\/config\/db\.js'/.test(script));
  check(`${name} has no direct mongoose.connect`, !/mongoose\.connect\(/.test(script));
}

// The local-only demo reset must hit the guard before it drops anything.
const LOCAL_PROD_URI = 'mongodb://127.0.0.1:27019/unique-frontdesk';
const reset = await runNode('server/src/scripts/reset-demo.js', {
  env: { VERCEL_ENV: 'preview', MONGODB_URI: LOCAL_PROD_URI },
});
check(
  'reset-demo refuses the production database on preview',
  reset.code === 1 && /Refusing to connect to the production database/.test(reset.output),
  reset.output.trim().split('\n').slice(-1)[0],
);

// Smoke cleanup runs its own connection; it must be refused the same way.
process.env.VERCEL_ENV = 'preview';
process.env.MONGODB_URI = LOCAL_PROD_URI;
const { sweepStaleSmokeBusinesses } = await import('../src/scripts/smoke-cleanup.js');
const sweepError = await sweepStaleSmokeBusinesses().then(
  () => null,
  (error) => error,
);
check(
  'smoke cleanup refuses the production database on preview',
  sweepError?.code === 'PREVIEW_PRODUCTION_DB',
  sweepError ? sweepError.message : 'cleaned up anyway',
);
check('smoke cleanup opened no connection', dbState() === 'disconnected', dbState());
delete process.env.VERCEL_ENV;
delete process.env.MONGODB_URI;

console.log(summary());
process.exit(exitCode());
