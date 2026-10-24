import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * ADR-297 — the proof that a second venue is data, not code.
 *
 * Nothing here ships a second venue. It feeds the real generator pipeline a made-up one — a
 * different gold, and a sprite only it draws — and checks the three things adding a venue relies
 * on: the SHAPES stay the same (same sprites, same grids), the COLOURS change (so a venue really
 * does recolour the set), and the version STAMP differs (so a browser can never mix two venues'
 * pictures under one URL).
 *
 * The pipeline is `.mjs`, which this package's tsconfig will not resolve, so it is imported
 * through computed specifiers — the same way `motifSprites.test.ts` reaches the Sentosa manifest.
 */

interface Corpus {
  ramps: Record<string, { tones: string[]; outline: string }>;
  grids: Record<string, string[]>;
}
interface Core {
  buildSprites: (corpus: Corpus) => Record<string, string>;
  versionOf: (sprites: Record<string, string>) => string;
}
interface ThemeCorpus {
  corpusFor: (theme: { ramps: Corpus['ramps']; grids: Corpus['grids'] }) => Corpus;
  SHARED_GRIDS: Record<string, string[]>;
}
interface Manifest {
  MANIFEST: { ramps: Corpus['ramps']; grids: Corpus['grids'] };
}

function scriptsDir(): string {
  let dir = resolve(process.cwd());
  while (!existsSync(join(dir, 'scripts', 'motifs', 'core.mjs'))) {
    const next = existsSync(join(dir, 'apps', 'web', 'scripts', 'motifs', 'core.mjs'))
      ? join(dir, 'apps', 'web')
      : dirname(dir);
    if (next === dir) throw new Error(`cannot locate apps/web from ${process.cwd()}`);
    dir = next;
  }
  return join(dir, 'scripts');
}

const load = async <T>(...parts: string[]): Promise<T> =>
  (await import(/* @vite-ignore */ pathToFileURL(join(scriptsDir(), ...parts)).href)) as T;

/** A venue that is not Sentosa: its own gold, and one sprite of its own. */
const REEF_RAMPS = {
  g: { tones: ['#d6f5ff', '#5fd0ff', '#1f8fc4', '#0b5a80'], outline: '#04293a' },
};
const REEF_GRIDS = {
  // A 2x2 sprite in the venue's gold material: enough to be a distinct, valid grid.
  lagoonbuoy: ['g2g2', 'g2g2'],
};

async function bothVenues() {
  const { corpusFor } = await load<ThemeCorpus>('motifs', 'theme-corpus.mjs');
  const { buildSprites, versionOf } = await load<Core>('motifs', 'core.mjs');
  const { MANIFEST } = await load<Manifest>('themes', 'sentosa', 'manifest.mjs');
  const sentosa = buildSprites(corpusFor(MANIFEST));
  const reef = buildSprites(corpusFor({ ramps: { ...MANIFEST.ramps, ...REEF_RAMPS }, grids: REEF_GRIDS }));
  return { sentosa, reef, versionOf, corpusFor, buildSprites };
}

describe('a second venue is data (ADR-297)', () => {
  it('draws the same shared sprites, in the same shapes', async () => {
    const { sentosa, reef } = await bothVenues();

    const viewBox = (svg: string) => svg.match(/viewBox="[^"]+"/)?.[0];
    const shared = Object.keys(reef).filter((name) => name in sentosa);
    expect(shared.length).toBeGreaterThan(100);
    for (const name of shared) expect(viewBox(reef[name] ?? ''), name).toBe(viewBox(sentosa[name] ?? ''));
    expect(Object.keys(reef)).toContain('lagoonbuoy');
  });

  it('recolours the set: a swapped gold reaches the sprites that use gold', async () => {
    const { sentosa, reef } = await bothVenues();

    expect(sentosa['trophy']).toContain('#ffc72c');
    expect(reef['trophy']).not.toContain('#ffc72c');
    expect(reef['trophy']).toContain('#5fd0ff');
  });

  it('gives the venue its own version stamp', async () => {
    const { sentosa, reef, versionOf } = await bothVenues();

    expect(versionOf(reef)).not.toBe(versionOf(sentosa));
    expect(versionOf(reef)).toMatch(/^[0-9a-f]{8}$/);
  });

  it('refuses a venue that redraws a shared sprite under the same name', async () => {
    const { corpusFor } = await load<ThemeCorpus>('motifs', 'theme-corpus.mjs');

    // Two grids for one name would make "the same sprite" mean two things across venues.
    expect(() => corpusFor({ ramps: {}, grids: { trophy: ['g2g2'] } })).toThrow(
      /redraw shared sprites: trophy/,
    );
  });

  it('names the missing material when a venue forgets a ramp the shared sprites use', async () => {
    const { corpusFor } = await load<ThemeCorpus>('motifs', 'theme-corpus.mjs');
    const { buildSprites } = await load<Core>('motifs', 'core.mjs');

    // Gold, sand, sea and the rest are venue-owned (ADR-297); the shared sprites are drawn in
    // them. A venue that defines none of them must fail loudly and say which one, not ship
    // sprites with holes where the colour should be.
    expect(() => buildSprites(corpusFor({ ramps: {}, grids: {} }))).toThrow(/unknown material "[bgprsm]"/);
  });

  it('rejects a venue grid that uses a material nobody defined', async () => {
    const { corpusFor } = await load<ThemeCorpus>('motifs', 'theme-corpus.mjs');
    const { buildSprites } = await load<Core>('motifs', 'core.mjs');
    const { MANIFEST } = await load<Manifest>('themes', 'sentosa', 'manifest.mjs');

    // `z` is not a ramp in the base palette or in this venue: a typo must stop the build, not
    // render a hole and report success (ADR-067).
    const typo = corpusFor({ ramps: MANIFEST.ramps, grids: { oddity: ['z2z2'] } });

    expect(() => buildSprites(typo)).toThrow(/unknown material "z"/);
  });
});
