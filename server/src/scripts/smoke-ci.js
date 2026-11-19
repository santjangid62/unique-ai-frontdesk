/**
 * Runs the smoke suite with no external services: starts a throwaway in-memory
 * MongoDB, seeds the demo workspace, serves the Express app on an ephemeral
 * port and runs scripts/smoke.js against it.
 *
 * Usage: npm run smoke:ci   (needs the mongodb-memory-server binary once)
 */
import { spawn } from 'node:child_process';

async function main() {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const memory = await MongoMemoryServer.create({ instance: { dbName: 'unique-frontdesk' } });
  const uri = memory.getUri('unique-frontdesk');

  // Set before app/env.js is imported so connectDB() uses this database and the
  // app never starts a second in-memory server of its own.
  process.env.MONGODB_URI = uri;
  process.env.USE_IN_MEMORY_DB = '0';

  const { connectDB, disconnectDB } = await import('../config/db.js');
  await connectDB(uri);

  const { runSeed } = await import('./seed.js');
  await runSeed({ quiet: true });

  const { default: app } = await import('../app.js');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  console.log(`\n[smoke:ci] seeded in-memory MongoDB, app listening on ${baseUrl}`);

  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, ['server/src/scripts/smoke.js'], {
      cwd: process.cwd(),
      env: { ...process.env, SMOKE_BASE_URL: baseUrl },
      stdio: 'inherit',
    });
    child.on('error', (error) => {
      console.error('[smoke:ci] could not start smoke.js', error.message);
      resolve(1);
    });
    child.on('exit', (exitCode) => resolve(exitCode ?? 1));
  });

  await new Promise((resolve) => server.close(resolve));
  await disconnectDB();
  await memory.stop();
  return code;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error('[smoke:ci] failed', error);
    process.exit(1);
  });
