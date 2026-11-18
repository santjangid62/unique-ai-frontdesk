/**
 * Starts a local MongoDB server from the binary in .mongo/ (downloaded by
 * scripts if missing is not attempted here - this only runs what is present).
 *
 *   npm run db:local
 *
 * Data lives in .mongo-data/ (gitignored) so the database survives restarts.
 * Connection string: mongodb://127.0.0.1:27017/unique-frontdesk
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const BIN_DIR = path.join(ROOT, '.mongo');
const DATA_DIR = path.join(ROOT, '.mongo-data');
const PORT = process.env.MONGO_PORT || '27017';

function findMongod(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const hit = findMongod(full);
      if (hit) return hit;
    } else if (/^mongod(\.exe)?$/i.test(entry.name)) {
      return full;
    }
  }
  return null;
}

function extractIfNeeded() {
  if (findMongod(BIN_DIR)) return;
  const zip = fs.readdirSync(BIN_DIR).find((name) => name.endsWith('.zip'));
  if (!zip) {
    console.error('\n  No mongod binary found.');
    console.error('  Download it with:');
    console.error('    curl -L -C - -o .mongo/mongodb.zip https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-6.0.18.zip');
    console.error('    (cd .mongo && tar -xf mongodb.zip)\n');
    process.exit(1);
  }
  console.log(`  Extracting ${zip}…`);
  const result = spawnSync('tar', ['-xf', zip], { cwd: BIN_DIR, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error('  Extraction failed. Extract the zip manually into .mongo/ and rerun.');
    process.exit(1);
  }
}

extractIfNeeded();

const mongod = findMongod(BIN_DIR);
if (!mongod) {
  console.error('  mongod binary still not found after extraction.');
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });

console.log(`\n  Starting MongoDB: ${path.relative(ROOT, mongod)}`);
console.log(`  Data directory  : ${path.relative(ROOT, DATA_DIR)}`);
console.log(`  Connection      : mongodb://127.0.0.1:${PORT}/unique-frontdesk\n`);

const child = spawn(mongod, ['--dbpath', DATA_DIR, '--port', PORT, '--bind_ip', '127.0.0.1'], {
  stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
