/**
 * Sandbox/agent Chromium extraction for the likeness gate (ADDENDUM-030).
 *
 * Where the Playwright CDN is unreachable, @sparticuz/chromium ships a
 * Chromium binary inside its npm tarball. Install the pinned browser
 * without saving it as a project dependency
 * (`npm install --no-save --ignore-scripts @sparticuz/chromium@153.0.0`),
 * run this script, and export the two lines it prints before `npm run e2e`.
 * Version 153.0.0 is pinned because the committed Linux baselines were
 * captured with Chromium 153.0.8010.0. On a normal machine none of this is
 * needed: `npx playwright install chromium` is the supported path.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const binDir = join(root, 'node_modules', '@sparticuz', 'chromium', 'bin');
if (!existsSync(binDir)) {
  console.error('Missing @sparticuz/chromium. Install it with:');
  console.error('  npm install --no-save --ignore-scripts @sparticuz/chromium@153.0.0');
  process.exit(1);
}

// The package's own executablePath() extracts the binary + SwiftShader
// libraries, but only unpacks the NSS libraries on Amazon Linux; do those
// ourselves so the binary can start on a bare sandbox.
const sparticuz = (await import('@sparticuz/chromium')).default;
const executable = await sparticuz.executablePath();
const libRoot = join(dirname(executable), 'pw-chromium-libs');
const tarPath = join(dirname(executable), 'pw-al2023.tar');
mkdirSync(libRoot, { recursive: true });
writeFileSync(tarPath, brotliDecompressSync(readFileSync(join(binDir, 'al2023.tar.br'))));
execFileSync('tar', ['-xf', tarPath, '-C', libRoot]);
const libDir = join(libRoot, 'lib');
if (!existsSync(join(libDir, 'libnss3.so'))) {
  console.error(`Expected libnss3.so under ${libDir} after extraction.`);
  process.exit(1);
}

console.log(`export PW_CHROMIUM_PATH=${executable}`);
console.log(`export PW_CHROMIUM_LIB=${libDir}:${dirname(executable)}`);
