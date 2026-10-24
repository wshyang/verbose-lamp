import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';

/**
 * ADR-147 — a second, tiny build that emits `dist/sw.js`, run after the main one:
 * `npm run build --workspace @psd/web` does both.
 *
 * Why not `apps/web/public/sw.js`? A file in `public/` is copied verbatim, which means it
 * could not import `policy.ts` and the policy could never be unit-tested. This config is the
 * price of a worker that is mostly testable in CI instead of not at all.
 *
 * The filename must not be hashed and the file must sit at the dist root: a worker's scope is
 * the directory its script is served from, and this one needs the whole origin. For the same
 * reason it must stay OUT of `IMMUTABLE_DIRECTORIES` in `apps/api/src/webStatic.ts` — a
 * worker held `immutable` for a year is a worker that cannot be updated or withdrawn. Two
 * tests in `web-static.test.ts` pin that.
 */

/** The hashed bundle emitted by the main build: exactly what a cold start needs, no art. */
function shellAssets(): string[] {
  const dir = join(import.meta.dirname, 'dist', 'assets');
  const names = readdirSync(dir).filter((name) => name.endsWith('.js') || name.endsWith('.css'));
  return names.sort().map((name) => `/assets/${name}`);
}

const shell = shellAssets();
/*
 * The build stamp is a hash of the shell's own filenames, which are themselves content
 * hashes. It therefore changes when and only when the bundle changes — no version file to
 * bump, no clock, and two identical builds produce the same cache name rather than orphaning
 * the previous one.
 */
const build = createHash('sha256').update(shell.join('\n')).digest('hex').slice(0, 8);

export default defineConfig({
  define: {
    __PSD_SHELL__: JSON.stringify(shell),
    __PSD_BUILD__: JSON.stringify(build),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2020',
    lib: {
      entry: join(import.meta.dirname, 'src/sw/worker.ts'),
      formats: ['iife'],
      name: 'psdWorker',
      fileName: () => 'sw.js',
    },
    rollupOptions: { output: { entryFileNames: 'sw.js' } },
  },
});
