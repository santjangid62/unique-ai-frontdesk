/**
 * Rebuilds docs/Unique-AI-Frontdesk-Setup-Guide.pdf from docs/SETUP-GUIDE.html and
 * records a digest of the HTML content in docs/SETUP-GUIDE.pdf.json, which
 * `npm run test:docs-pdf` compares — so a stale PDF cannot be pushed.
 *
 *   npm run pdf:build
 *
 * Needs a local Chrome or Edge (set CHROME_BIN to pick a specific binary).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const HTML = path.join(ROOT, 'docs/SETUP-GUIDE.html');
export const PDF = path.join(ROOT, 'docs/Unique-AI-Frontdesk-Setup-Guide.pdf');
export const STAMP = path.join(ROOT, 'docs/SETUP-GUIDE.pdf.json');

const CANDIDATES = {
  win32: [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ],
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
  linux: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
};

/**
 * Digest of the HTML's content, ignoring what differs between checkouts and
 * machines (BOM, CRLF vs LF, trailing spaces). The PDF itself is never hashed:
 * a rebuild on another OS or Chrome version produces different bytes for the
 * same content.
 */
export function htmlDigest(source) {
  const normalized = source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n*$/, '\n');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/** First existing browser binary, honouring CHROME_BIN. */
export function findBrowser() {
  if (process.env.CHROME_BIN) return existsSync(process.env.CHROME_BIN) ? process.env.CHROME_BIN : null;
  return (CANDIDATES[process.platform] || []).find((candidate) => existsSync(candidate)) || null;
}

function main() {
  const browser = findBrowser();
  if (!browser) {
    console.error('[pdf:build] No Chrome/Edge found. Install one or set CHROME_BIN to its executable.');
    process.exit(1);
  }

  const profile = mkdtempSync(path.join(os.tmpdir(), 'chrome-pdf-'));
  const result = spawnSync(
    browser,
    [
      '--headless',
      '--disable-gpu',
      '--no-pdf-header-footer',
      `--user-data-dir=${profile}`,
      `--print-to-pdf=${PDF}`,
      pathToFileURL(HTML).href,
    ],
    { encoding: 'utf8' },
  );
  rmSync(profile, { recursive: true, force: true });

  if (result.status !== 0 || !existsSync(PDF)) {
    console.error('[pdf:build] Chrome could not write the PDF.');
    console.error(result.stdout || result.stderr || result.error?.message || '');
    process.exit(1);
  }
  if (!readFileSync(PDF).subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    console.error('[pdf:build] The generated file is not a PDF.');
    process.exit(1);
  }

  const stamp = { htmlDigest: htmlDigest(readFileSync(HTML, 'utf8')) };
  writeFileSync(STAMP, `${JSON.stringify(stamp, null, 2)}\n`);

  const pages = (readFileSync(PDF, 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log(
    `[pdf:build] ${path.basename(PDF)} — ${statSync(PDF).size} bytes, ~${pages} pages; content digest ${stamp.htmlDigest.slice(0, 12)} stored in ${path.basename(STAMP)}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
