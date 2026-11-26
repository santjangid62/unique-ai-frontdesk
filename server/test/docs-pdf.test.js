/**
 * Fails when the committed setup-guide PDF was not rebuilt after the HTML changed.
 *
 *   npm run test:docs-pdf
 *
 * Compares the HTML's content digest (line endings, BOM and trailing spaces
 * ignored) with the one `npm run pdf:build` recorded, so the check behaves the
 * same on every machine and OS. The PDF bytes are deliberately not compared:
 * a rebuild on Linux or a newer Chrome produces different bytes for the same
 * content.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createChecker } from './helpers.js';
import { HTML, PDF, STAMP, htmlDigest } from '../src/scripts/build-setup-pdf.js';

const { check, summary, exitCode } = createChecker();
const REBUILD = 'run `npm run pdf:build` and commit the PDF with its stamp';
const exists = (file) => existsSync(file);

console.log('\nSetup guide PDF vs its HTML source');

check(`PDF exists (${path.basename(PDF)})`, exists(PDF), REBUILD);
check(`stamp exists (${path.basename(STAMP)})`, exists(STAMP), REBUILD);

if (exists(PDF) && exists(STAMP)) {
  const stamp = JSON.parse(readFileSync(STAMP, 'utf8'));
  const digest = htmlDigest(readFileSync(HTML, 'utf8'));
  check(
    'HTML content is the one the PDF was built from',
    stamp.htmlDigest === digest,
    `${digest.slice(0, 12)} now vs ${String(stamp.htmlDigest || 'no digest').slice(0, 12)} in the stamp — ${REBUILD}`,
  );
}

console.log(summary());
process.exit(exitCode());
