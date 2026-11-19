/**
 * Rebuilds the local demo workspace from scratch: drops the current database,
 * then runs the seed and the extra demo data. Use it when manual testing has
 * left the data in a state the seed can no longer recognise (changed statuses,
 * cancelled appointments, test replies), because the seed only fills missing
 * records and `demo:data` never overwrites what already exists.
 *
 *   npm run demo:reset
 *
 * Refuses to run against anything but a loopback MongoDB.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import mongoose from 'mongoose';
import { env } from '../config/env.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function main() {
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)([:/]|$)/.test(env.mongoUri)) {
    throw new Error('demo:reset only drops a local MongoDB (mongodb://127.0.0.1/...) so a shared or Atlas database is never touched');
  }

  await mongoose.connect(env.mongoUri);
  const dbName = mongoose.connection.name;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  console.log(`[demo:reset] dropped local database "${dbName}"`);

  for (const script of ['server/src/scripts/seed.js', 'server/src/scripts/demo-data.js']) {
    execFileSync(process.execPath, [script], { stdio: 'inherit', cwd: projectRoot });
  }

  console.log('[demo:reset] demo workspace rebuilt: seed data plus dummy leads, chats and appointments');
}

main().catch((error) => {
  console.error(`[demo:reset] ${error.message}`);
  process.exit(1);
});
