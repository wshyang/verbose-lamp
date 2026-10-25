import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MOTIF_NAMES } from './motifs.js';
import { themeFor } from '../themes/index.js';

/**
 * ADR-067 — the committed sprites, checked against the stamp that claims to describe them.
 *
 * Nothing used to verify that `public/themes/sentosa/motifs/` matched the generator: `check-standards.mjs`
 * scans neither `apps/web/scripts` nor `public/`, and `PixelMotif.test.tsx` compares two values
 * that both come out of the same generated module, so a stale `art/motifVersion.ts` is
 * self-consistent and passes. A commit could change the art and ship yesterday's pictures.
 *
 * This file closes that by recomputing the stamp from the files on disk. It only works because
 * `versionOf` hashes the *emitted SVG* rather than the grids.
 */
/** Vite rewrites `import.meta.url` to a non-file URL, so anchor on the web workspace instead. */
function webRoot(): string {
  let dir = resolve(process.cwd());
  while (!existsSync(join(dir, 'public', 'themes', 'sentosa', 'motifs'))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error('cannot locate apps/web from ' + process.cwd());
    dir = existsSync(join(dir, 'apps', 'web', 'public', 'themes', 'sentosa', 'motifs')) ? join(dir, 'apps', 'web') : parent;
  }
  return dir;
}

// The Sentosa theme's stamp, reached through the registry (ADR-294): this test pins ONE venue's
// committed files, and it is the registry that says which stamp belongs to which venue.
const MOTIF_VERSION = themeFor('sentosa').motifVersion;
const WEB_ROOT = webRoot();
const MOTIF_DIR = join(WEB_ROOT, 'public', 'themes', 'sentosa', 'motifs');
const CSS_PATH = join(WEB_ROOT, 'src', 'styles', 'gameboy.css');
// ADR-296 — the sprites the stylesheet places are named by role variables (--motif-*) defined in
// the theme; the stylesheet itself carries no sprite URL. The theme is where the names and the
// ?v= stamps live, so that is what these checks read.
const THEME_PATH = join(WEB_ROOT, 'src', 'themes', 'sentosa', 'theme.css');

const spriteFiles = readdirSync(MOTIF_DIR).filter((file) => file.endsWith('.svg'));
const spriteNames = spriteFiles.map((file) => file.replace(/\.svg$/, ''));
const svgByName = Object.fromEntries(
  spriteNames.map((name) => [name, readFileSync(`${MOTIF_DIR}/${name}.svg`, 'utf8')]),
);
const css = readFileSync(CSS_PATH, 'utf8');
const themeCss = readFileSync(THEME_PATH, 'utf8');

/** First capture of every match, dropping any that did not capture. Keeps the types honest. */
function captures(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));
}

const cssReferences = captures(themeCss, /\/themes\/sentosa\/motifs\/([a-z0-9-]+)\.svg/g);

describe('committed motif sprites (ADR-067)', () => {
  it('is what the generator last wrote — the stamp is a hash of these exact files', () => {
    const hash = createHash('sha256');
    for (const name of [...spriteNames].sort()) hash.update(`${name}:${svgByName[name]}`);

    expect(hash.digest('hex').slice(0, 8)).toBe(MOTIF_VERSION);
  });

  it('carries the current stamp on every theme reference', () => {
    const stamps = captures(themeCss, /\/themes\/sentosa\/motifs\/[a-z0-9-]+\.svg\?v=([0-9a-f]+)/g);

    expect(stamps.length).toBeGreaterThan(0);
    expect([...new Set(stamps)]).toEqual([MOTIF_VERSION]);
  });

  it('has a file behind every name the app can ask for', () => {
    for (const name of MOTIF_NAMES) expect(spriteNames).toContain(name);
    for (const name of cssReferences) expect(spriteNames).toContain(name);
  });

  it('ships nothing that nobody references', () => {
    const wanted = new Set<string>([...MOTIF_NAMES, ...cssReferences]);
    const orphans = spriteNames.filter((name) => !wanted.has(name));

    expect(orphans).toEqual([]);
  });

  it('paints only palette colours', async () => {
    // Imported through computed specifiers: the art modules are .mjs, which this package's
    // tsconfig will not resolve, and the theme's palette is the only source of truth for the hexes.
    const scripts = join(WEB_ROOT, 'scripts');
    const load = async (...parts: string[]) =>
      (await import(/* @vite-ignore */ pathToFileURL(join(scripts, ...parts)).href)) as Record<string, any>;
    const { corpusFor } = await load('motifs', 'theme-corpus.mjs');
    const { rampColours } = await load('motifs', 'core.mjs');
    const { MANIFEST } = await load('themes', 'sentosa', 'manifest.mjs');
    const allowed: Set<string> = rampColours(corpusFor(MANIFEST).ramps);

    for (const [name, svg] of Object.entries(svgByName)) {
      for (const fill of new Set(captures(svg, /fill="([^"]+)"/g))) {
        expect(allowed, `${name} paints ${fill}`).toContain(fill);
      }
    }
  });

  it('declares an intrinsic size of exactly four times its grid', () => {
    for (const [name, svg] of Object.entries(svgByName)) {
      const box = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
      const size = svg.match(/width="(\d+)" height="(\d+)"/);

      expect(box, `${name} has a viewBox`).not.toBeNull();
      expect(size, `${name} has intrinsic dimensions`).not.toBeNull();
      expect(Number(size?.[1])).toBe(Number(box?.[1]) * 4);
      expect(Number(size?.[2])).toBe(Number(box?.[2]) * 4);
    }
  });

  /**
   * A repeating tile's CSS size and its grid are coupled and nothing else checks them. The
   * aspect ratio must match or the strip renders visibly stretched. The stricter rule — that
   * the tile is a whole-number multiple — waits for `wave` to move to a 20×10 grid; today it
   * ships at 1.25× and 1.5×, which `npm run motifs` reports as a warning.
   */
  it('keeps every repeating tile at its grid aspect ratio', () => {
    // role -> sprite, from the theme: `--motif-shoreline: url('/themes/sentosa/motifs/wave.svg…')`
    const spriteOfRole = new Map(
      [...themeCss.matchAll(/(--motif-[a-z]+):\s*url\('\/themes\/sentosa\/motifs\/([a-z0-9-]+)\.svg/g)].map(
        (hit) => [hit[1] ?? '', hit[2] ?? ''] as const,
      ),
    );
    const pattern = /var\((--motif-[a-z]+)\)[^;]*?\/\s*(\d+)px\s+(\d+)px/g;
    const tiles = [...css.matchAll(pattern)].map(
      (hit) => [hit[0], spriteOfRole.get(hit[1] ?? ''), hit[2], hit[3]] as const,
    );

    expect(tiles.length).toBeGreaterThan(0);
    for (const [, name, width, height] of tiles) {
      const svg = name === undefined ? undefined : svgByName[name];
      expect(svg, `tile references a committed sprite`).toBeDefined();

      const box = svg?.match(/viewBox="0 0 (\d+) (\d+)"/);
      const gridAspect = Number(box?.[1]) / Number(box?.[2]);

      expect(Number(width) / Number(height), `${name} tile ${width}x${height}`).toBe(gridAspect);
    }
  });
});
