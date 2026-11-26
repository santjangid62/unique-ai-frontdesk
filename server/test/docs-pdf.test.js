/**
 * Fails when the committed setup-guide PDF was not rebuilt after the HTML changed.
 *
 *   npm run test:docs-pdf
 *
 * `npm run pdf:build` writes docs/SETUP-GUIDE.pdf.json with the hash of the HTML and
 * the PDF it produced; this compares both, so a stale PDF cannot be pushed.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createChecker } from './helpers.js';
import { HTML, PDF, STAMP, sha256 } from '../src/scripts/build-setup-pdf.js';

const { check, summary, exitCode } = createChecker();
const REBUILD = 'run `npm run pdf:build` and commit both files';

console.log('\nSetup guide PDF vs its HTML source');

const stampOk = existsSync(STAMP);
check(`stamp file exists (${path.basename(STAMP)})`, stampOk, REBUILD);

const pdfOk = existsSync(PDF);
check(`PDF exists (${path.basename(PDF)})`, pdfOk, REBUILD);

let stamp = {};
if (stampOk) {
  try {
    stamp = JSON.parse(readFileSync(STAMP, 'utf8'));
  } catch {
    check('stamp file is valid JSON', false, REBUILD);
  }
}

if (stampOk && pdfOk) {
  const htmlHash = sha256(HTML);
  check(
    'HTML has not changed since the PDF was built',
    stamp.htmlSha256 === htmlHash,
    `docs/SETUP-GUIDE.html hash is ${htmlHash.slice(0, 12)} but the PDF was built from ${String(stamp.htmlSha256).slice(0, 12)} — ${REBUILD}`,
  );
  check(
    'PDF matches the recorded build',
    stamp.pdfSha256 === sha256(PDF),
    `PDF hash differs from ${path.basename(STAMP)} — ${REBUILD}`,
  );
}

console.log(summary());
process.exit(exitCode());
