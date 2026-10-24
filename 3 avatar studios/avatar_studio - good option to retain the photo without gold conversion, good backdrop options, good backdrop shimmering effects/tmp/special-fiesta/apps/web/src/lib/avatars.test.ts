import { describe, expect, it } from 'vitest';
import {
  AVATAR_BUILDS,
  formatAvatarSprite,
  AVATAR_HAIR_STYLES,
  asAvatarColour,
  AVATAR_PERSONAS,
  AVATAR_PERSONA_PRESETS,
  AVATAR_SKIN_TONES,
  AVATAR_VARIANT_COUNT,
  DEFAULT_AVATAR_LOOK_CODE,
  formatAvatarLook,
  parseAvatarLook,
  readAvatarLook,
  SUNBURST_RAYS_MAX,
  SUNBURST_RAYS_MIN,
  SUNBURST_TWIST_MAX,
  SUNBURST_TWIST_MIN,
} from '@psd/contracts';
import { concentricBandOfCell } from './avatar/concentric.js';
import { psychedelicBandOfCell } from './avatar/psychedelic.js';
import { wavesBandOfCell } from './avatar/waves.js';
import { required } from './required.js';
import {
  AVATAR_VARIANTS,
  avatarAlt,
  avatarPersona,
  avatarSvg,
  avatarUrl,
  personaLook,
  photoSpriteUrl,
  swatchOptions,
  nextVariant,
} from './avatars.js';
import {
  ART_SIZE,
  AVATAR_LAYERS,
  BACKDROP_COLOURS,
  HAIR_COLOURS,
  OUTFIT_COLOURS,
  PROP_COLOURS,
  SKIN_TONES,
} from './avatarArt.js';

/**
 * ADR-021/ADR-026 — the art is data and the palette is the participant's, so these tests
 * guard the join between them: every combination has to draw, and no choice may go
 * missing.
 */

const someone = { gender: 'female', avatarVariant: 3, avatarLook: '5-2-6-1-2-4' } as const;

/** Beard cells that land where the skull of that build has nothing — always empty. */
function offSkull(build: number, facialHair: number): string[] {
  const head = required(AVATAR_LAYERS[`head.male.${build}`], 'head');
  const beard = required(AVATAR_LAYERS[`beard.${build}.${facialHair}`], 'beard');
  const stray: string[] = [];
  for (let row = 0; row < ART_SIZE; row += 1) {
    const skull = decodeRow(required(head[row], 'row'));
    const growth = decodeRow(required(beard[row], 'row'));
    const columns = [...growth].map((key, x) => (key !== '.' && skull[x] === '.' ? `${x},${row}` : ''));
    stray.push(...columns.filter((entry) => entry !== ''));
  }
  return stray;
}

/** The art ships run-length encoded; tests that read pixels expand a row first. */
function decodeRow(encoded: string): string {
  let row = '';
  for (const [, key, count] of encoded.matchAll(/(.)(\d+)/g)) row += String(key).repeat(Number(count));
  return row;
}

describe('avatar composition', () => {
  it('offers one character per persona', () => {
    expect(AVATAR_VARIANTS).toEqual([1, 2, 3, 4, 5]);
    expect(AVATAR_PERSONAS).toHaveLength(AVATAR_VARIANT_COUNT);
    expect(avatarPersona(1)).toBe('Skipper');
    expect(avatarPersona(5)).toBe('Sundowner');
    // The server should never send this, but a broken number still has to draw a face.
    expect(avatarPersona(9)).toBe('Skipper');
  });

  it('draws an SVG the size of the art, with no unresolved pixels', () => {
    const svg = avatarSvg(someone);
    expect(svg).toContain(`viewBox="0 0 ${ART_SIZE} ${ART_SIZE}"`);
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).not.toContain('fill="undefined"');
    // Runs are merged, so a 64×64 portrait is a fraction of its 4 096 cells.
    expect(svg.split('<rect').length - 1).toBeLessThan(1200);
    // Small enough to inline thirty of them in a leaderboard without thinking about it.
    expect(encodeURIComponent(svg).length).toBeLessThan(40_000);
  });

  it('gives each archetype its own eyes and keeps the frame opaque (ADR-026)', () => {
    const skipper = avatarSvg({ ...someone, avatarVariant: 1 });
    const hype = avatarSvg({ ...someone, avatarVariant: 4 });

    // The iris takes the persona accent: gold for the Skipper, rose for the Hype.
    expect(skipper).toContain(PROP_COLOURS[0]?.accent ?? '');
    expect(hype).toContain(PROP_COLOURS[3]?.accent ?? '');
    expect(skipper).not.toContain(PROP_COLOURS[3]?.accent ?? '');
  });

  it('has a jaw and a beard for every build, and pairs them (ADR-030)', () => {
    for (const gender of ['male', 'female'] as const) {
      for (let build = 1; build <= AVATAR_BUILDS.length; build += 1) {
        expect(AVATAR_LAYERS[`head.${gender}.${build}`], `head.${gender}.${build}`).toBeDefined();
        expect(AVATAR_LAYERS[`torso.${gender}.${build}`], `torso.${gender}.${build}`).toBeDefined();
      }
    }
    for (let build = 1; build <= AVATAR_BUILDS.length; build += 1) {
      for (const facialHair of [2, 3]) {
        expect(AVATAR_LAYERS[`beard.${build}.${facialHair}`]).toBeDefined();
      }
    }

    // And the beard actually follows the jaw: a Broad chin carries growth further out
    // than a Slight one, on the same row.
    const widthAt = (name: string, row: number) =>
      [...decodeRow(required(AVATAR_LAYERS[name], name)[row] ?? '')].filter((key) => key !== '.').length;
    expect(widthAt('beard.5.3', 46)).toBeGreaterThan(widthAt('beard.1.3', 46));
    expect(widthAt('beard.5.2', 46)).toBeGreaterThan(widthAt('beard.1.2', 46));
    // Nothing spills past the head it belongs to.
    for (let build = 1; build <= AVATAR_BUILDS.length; build += 1) {
      for (const facialHair of [2, 3]) {
        expect(offSkull(build, facialHair), `build ${build} facial ${facialHair}`).toEqual([]);
      }
    }
  });

  it('wears a photo sprite when there is one, and falls back when it is broken (ADR-031)', () => {
    const rows = Array.from({ length: 64 }, () => '0'.repeat(64));
    const photo = formatAvatarSprite({ size: 64, palette: ['#ff00aa', '#12243a'], rows });

    const drawn = avatarSvg(someone);
    const worn = avatarSvg({ ...someone, avatarPhoto: photo });
    expect(worn).not.toBe(drawn);
    expect(worn).toContain('#ff00aa');
    // One flat colour is one rectangle.
    expect(worn.split('<path').length - 1).toBe(1);
    expect(avatarAlt({ avatarVariant: 1, avatarPhoto: photo })).toBe('Photo portrait');

    // A code that will not parse must not leave a hole where a face should be.
    expect(avatarSvg({ ...someone, avatarPhoto: 'not-a-sprite' })).toBe(drawn);
    expect(avatarSvg({ ...someone, avatarPhoto: null })).toBe(drawn);
    // And the cache tells the two apart.
    expect(avatarUrl({ ...someone, avatarPhoto: photo })).not.toBe(avatarUrl(someone));
  });

  it('paints a sunburst behind a drawn avatar, keeping the vignette (ADR-173)', () => {
    const plain = avatarSvg({ ...someone, avatarLook: '3-1-2-1-3-1f4e9c-1d5b8c' });
    const sunny = avatarSvg({ ...someone, avatarLook: '3-1-2-1-3-1f4e9c-1d5b8c-f7d154-12-4' });

    expect(sunny).not.toBe(plain);
    // The second colour appears, and so does its shade: the vignette survives the pattern
    // instead of being flattened into one flat ring of the new colour.
    expect(sunny).toContain('#f7d154');
    expect(sunny.split('<path').length - 1).toBeGreaterThan(plain.split('<path').length - 1);
    // The first colour is still the backdrop the participant had already chosen.
    expect(sunny).toContain('#1d5b8c');
  });

  it('paints the same sunburst behind a photo, without touching the stored sprite (ADR-173)', () => {
    // Palette order is [...photo colours, backdrop, ink], so '1' here is the backdrop.
    const photo = formatAvatarSprite({
      size: 64,
      palette: ['#ff00aa', '#12243a', '#000000'],
      rows: Array.from({ length: 64 }, () => `${'0'.repeat(32)}${'1'.repeat(32)}`),
    });
    const base = { ...someone, avatarPhoto: photo };

    const plain = avatarSvg(base);
    const sunny = avatarSvg({ ...base, avatarLook: '3-1-2-1-3-1f4e9c-1d5b8c-f7d154-12-4' });

    expect(plain).not.toContain('#f7d154');
    expect(sunny).toContain('#f7d154');
    // The photograph's own colours are untouched — only backdrop cells were split.
    expect(sunny).toContain('#ff00aa');
    // And nothing was written back into the sprite: the same code still renders plainly.
    expect(avatarSvg(base)).toBe(plain);
  });

  it('paints the sunburst into the ONE image the studio previews (ADR-173/181)', () => {
    /*
     * ADR-181 removed `avatarPreviewLayers`, which split the preview into a rotating backdrop
     * and a still face. The spin glitched and nothing needed it — the saved avatar was always
     * static, so the moving preview was the only view that did not show what gets saved. What
     * has to stay true is that the sunburst is in the finished picture, for both kinds of
     * avatar, since that single picture is now the preview as well.
     */
    const plain = decodeURIComponent(avatarSvg(someone));
    const sunny = decodeURIComponent(
      avatarSvg({ ...someone, avatarLook: '3-1-2-1-3-1f4e9c-1d5b8c-f7d154-12-4' }),
    );

    // Both sunburst colours are in the one grid, and the plain look has neither the second
    // colour nor any of the half-painted `none` cells the two-layer split used to need.
    expect(sunny).toContain('#f7d154');
    expect(sunny).toContain('#1d5b8c');
    expect(plain).not.toContain('#f7d154');
    expect(sunny).not.toContain('fill="none"');
  });

  it('paints it into a photo sprite the same way (ADR-173/181)', () => {
    const photo = formatAvatarSprite({
      size: 64,
      palette: ['#ff00aa', '#12243a', '#000000'],
      rows: Array.from({ length: 64 }, () => `${'0'.repeat(32)}${'1'.repeat(32)}`),
    });
    const drawn = decodeURIComponent(
      avatarSvg({
        ...someone,
        avatarPhoto: photo,
        avatarLook: '3-1-2-1-3-1f4e9c-1d5b8c-f7d154-12-4',
      }),
    );

    // The photograph's own colours and the sunburst's share one picture.
    expect(drawn).toContain('#ff00aa');
    expect(drawn).toContain('#f7d154');
  });

  it('paints the pattern into the tuning preview, the same picture the saved avatar is (ADR-225)', () => {
    const photo = formatAvatarSprite({
      size: 64,
      palette: ['#ff00aa', '#12243a', '#000000'],
      rows: Array.from({ length: 64 }, () => `${'0'.repeat(32)}${'1'.repeat(32)}`),
    });
    const look = readAvatarLook('3-1-2-1-3-1f4e9c-1d5b8c-f7d154-12-4');
    expect(look.sunburst).not.toBeNull();

    // The square and the saved avatar are one address once the pattern is on, and differ from the plain colour.
    const saved = avatarUrl({ ...someone, avatarPhoto: photo, avatarLook: formatAvatarLook(look) });
    expect(photoSpriteUrl(photo, look.sunburst)).toBe(saved);
    expect(photoSpriteUrl(photo, null)).not.toBe(saved);
  });

  it('draws a 128×128 photo sprite whole, not one quadrant of it (ADR-037/057)', () => {
    /*
     * The bug this pins: `rectsFor` and `svgOf` scanned a hardcoded 64×64 grid (`ART_SIZE`, the
     * size of the DRAWN art) regardless of the sprite's own size. Photo sprites have been 128×128
     * since ADR-037, so every real photo avatar was rendered from the top-left quarter of its data
     * and stretched over the whole frame — a corner of someone's head, blown up.
     *
     * The suite missed it for one reason worth remembering: the test above builds its fixture at
     * `size: 64`, which predates ADR-037. A fixture that no longer resembles production data is a
     * test that cannot fail. So this one marks the far corner and insists it is drawn.
     */
    const size = 128;
    const corner = '#ff00aa';
    const rows = Array.from({ length: size }, (_unused, y) =>
      Array.from({ length: size }, (_ignored, x) => (x >= 96 && y >= 96 ? '1' : '0')).join(''),
    );
    const photo = formatAvatarSprite({ size, palette: ['#223344', corner], rows });

    const worn = avatarSvg({ ...someone, avatarPhoto: photo });

    // The viewBox must describe the real grid, or the right picture is drawn at the wrong scale.
    expect(worn).toContain('viewBox="0 0 128 128"');
    // A colour that exists ONLY in the bottom-right quadrant proves the whole grid was read.
    expect(worn).toContain(corner);
    // And it is drawn where it belongs: a 32×32 block starting at (96, 96).
    expect(worn).toContain('M96 96h32v32h-32z');
  });

  it('still draws the drawn character at its own 64×64 size', () => {
    // The fix makes the grid follow the data, so the hand-drawn art must be unaffected by it.
    expect(avatarSvg(someone)).toContain(`viewBox="0 0 ${ART_SIZE} ${ART_SIZE}"`);
  });

  it('expands the run-length rows back to a full square of cells', () => {
    for (const [name, rows] of Object.entries(AVATAR_LAYERS)) {
      expect(rows, name).toHaveLength(ART_SIZE);
      for (const row of rows) {
        const width = [...row.matchAll(/(.)(\d+)/g)].reduce((sum, [, , count]) => sum + Number(count), 0);
        expect(width, name).toBe(ART_SIZE);
      }
    }
  });

  it('draws every combination the studio can produce', () => {
    const drawAll = (gender: 'male' | 'female') =>
      AVATAR_VARIANTS.flatMap((avatarVariant) =>
        AVATAR_HAIR_STYLES[gender].flatMap((_style, index) =>
          [1, 2, 3].map((facialHair) =>
            avatarSvg({
              gender,
              avatarVariant,
              avatarLook: formatAvatarLook({
                skinTone: 4,
                hairStyle: index + 1,
                hairColour: 5,
                facialHair,
                build: 3,
                outfitColour: '#c0392b',
                backdrop: '#158a5f',
                sunburst: null,
              }),
            }),
          ),
        ),
      );

    const codes = [...drawAll('male'), ...drawAll('female')];
    expect(codes).toHaveLength(150);
    expect(codes.every((svg) => svg.endsWith('</svg>'))).toBe(true);
  });

  it('changes the drawing when any single choice changes', () => {
    const base = avatarSvg(someone);
    const axes = ['1-2-6-1-2-4', '5-3-6-1-2-4', '5-2-7-1-2-4', '5-2-6-1-8-4', '5-2-6-1-2-9'];
    for (const avatarLook of axes) {
      expect(avatarSvg({ ...someone, avatarLook })).not.toBe(base);
    }
    expect(avatarSvg({ ...someone, gender: 'male' })).not.toBe(base);
    expect(avatarSvg({ ...someone, avatarVariant: 2 })).not.toBe(base);
  });

  it('grows a beard only on the masculine build', () => {
    const clean = { gender: 'male', avatarVariant: 1, avatarLook: '3-1-2-1-1-1' } as const;
    const bearded = { ...clean, avatarLook: '3-1-2-3-1-1' };
    expect(avatarSvg(bearded)).not.toBe(avatarSvg(clean));

    const her = { gender: 'female', avatarVariant: 1, avatarLook: '3-1-2-1-1-1' } as const;
    expect(avatarSvg({ ...her, avatarLook: '3-1-2-3-1-1' })).toBe(avatarSvg(her));
  });

  it('falls back rather than breaking on art it cannot draw', () => {
    expect(avatarSvg({ ...someone, avatarLook: 'nonsense' })).toBe(
      avatarSvg({ ...someone, avatarLook: DEFAULT_AVATAR_LOOK_CODE }),
    );
    expect(avatarSvg({ ...someone, avatarVariant: 99 })).toBe(
      avatarSvg({ ...someone, avatarVariant: 1 }),
    );
  });

  it('serves a data URL and reuses it for the same appearance', () => {
    const url = avatarUrl(someone);
    expect(url.startsWith('data:image/svg+xml,')).toBe(true);
    expect(avatarUrl({ ...someone })).toBe(url);
    expect(avatarUrl({ ...someone, avatarLook: '1-1-1-1-1-1' })).not.toBe(url);
  });

  it('describes the portrait by persona rather than by file number', () => {
    expect(avatarAlt({ avatarVariant: 2 })).toBe('Sprinter portrait');
  });
});

/**
 * ADR-206 — bands generalised the renderer from a boolean to an index, and the thing that must
 * NOT have changed is what every spiral already in the database draws.
 *
 * This renders the whole legacy space — 242 codes, rays 3…24 by twist 0…10 — through the real
 * `avatarSvg` and asserts the output is byte-identical to the two-band form. Not "looks the
 * same": identical. A generalisation that quietly moves one cell is a generalisation that has
 * edited somebody's face, and there is no way to notice that by looking at three examples.
 */
describe('bands leave every existing spiral untouched (ADR-206)', () => {
  const someone = {
    gender: 'male' as const,
    avatarVariant: 3,
    avatarPhoto: null,
    avatarLook: null as string | null,
  };

  it('renders all 242 legacy spirals byte-identically at two bands', () => {
    let checked = 0;
    for (let rays = SUNBURST_RAYS_MIN; rays <= SUNBURST_RAYS_MAX; rays += 1) {
      for (let twist = SUNBURST_TWIST_MIN; twist <= SUNBURST_TWIST_MAX; twist += 1) {
        const base = `3-1-2-1-3-1f4e9c-1d5b8c-f7d154-${rays}-${twist}`;
        const tagged = `3-1-2-1-3-1f4e9c-1d5b8c-s-f7d154-${rays}-${twist}`;
        const legacy = avatarSvg({ ...someone, avatarLook: base });
        expect(avatarSvg({ ...someone, avatarLook: tagged })).toBe(legacy);
        checked += 1;
      }
    }
    expect(checked).toBe(242);
  });

  it('actually paints more colours when more bands are asked for', () => {
    // The counterweight to the test above: proving nothing changed is only worth having if
    // something CAN change. Each extra band is one more fill in the SVG.
    const colours = (code: string) =>
      new Set(avatarSvg({ ...someone, avatarLook: code }).match(/#[0-9a-f]{6}/gu) ?? []).size;
    const two = colours('3-1-2-1-3-1f4e9c-1d5b8c-s-f7d154-12-4');
    const three = colours('3-1-2-1-3-1f4e9c-1d5b8c-s-f7d154-12-4-3');
    const four = colours('3-1-2-1-3-1f4e9c-1d5b8c-s-f7d154-12-4-4');
    expect(three).toBeGreaterThan(two);
    expect(four).toBeGreaterThan(three);
  });

  it('puts the interpolated band BETWEEN its two ends, not beside them', () => {
    // Three bands on a dark-blue backdrop and a gold second colour: the middle band has to be
    // between them on every channel, or the ramp is not a ramp.
    const svg = avatarSvg({ ...someone, avatarLook: '3-1-2-1-3-1f4e9c-1d5b8c-s-f7d154-12-0-3' });
    const found = [...new Set(svg.match(/#[0-9a-f]{6}/gu) ?? [])].map((c) => c.slice(1));
    const channels = (hex: string) =>
      [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
    const [from, to] = [channels('1d5b8c'), channels('f7d154')];
    const middle = found
      .map(channels)
      .filter((c) => c.every((v, i) => {
        const [low, high] = [Math.min(from[i] ?? 0, to[i] ?? 0), Math.max(from[i] ?? 0, to[i] ?? 0)];
        return v > low && v < high;
      }));
    expect(middle.length).toBeGreaterThan(0);
  });
});

/**
 * ADR-207 — 🌀 concentric radiating shapes: the first pattern that is not a spiral, and so the
 * first real test of whether the tag, the bands and the dispatch actually generalise.
 */
describe('concentric radiating shapes (ADR-207)', () => {
  const someone = {
    gender: 'male' as const,
    avatarVariant: 3,
    avatarPhoto: null,
    avatarLook: null as string | null,
  };
  const base = '3-1-2-1-3-1f4e9c-1d5b8c';
  const rings = { kind: 'concentric' as const, colourTwo: '#f7d154', bands: 3,
    shape: 2, ringWidth: 8, lobes: 6, lobeDepth: 2 };

  it('round-trips through the wire format at fixed arity', () => {
    const look = { ...readAvatarLook(`${base}`), sunburst: rings };
    expect(formatAvatarLook(look)).toBe(`${base}-c-f7d154-2-8-6-2-3`);
    expect(parseAvatarLook(`${base}-c-f7d154-2-8-6-2-3`)?.sunburst).toEqual(rings);
  });

  it('refuses a short, long or out-of-range group rather than guessing', () => {
    // Fixed arity is the point: unlike the spiral there is no history to be lenient about,
    // so every part is required and a missing one is an error rather than a default.
    expect(parseAvatarLook(`${base}-c-f7d154-2-8-6-2`)).toBeNull();
    expect(parseAvatarLook(`${base}-c-f7d154-2-8-6-2-3-1`)).toBeNull();
    expect(parseAvatarLook(`${base}-c-f7d154-0-8-6-2-3`)).toBeNull();  // no such shape
    expect(parseAvatarLook(`${base}-c-f7d154-5-8-6-2-3`)).toBeNull();  // nor that one
    expect(parseAvatarLook(`${base}-c-f7d154-2-3-6-2-3`)).toBeNull();  // ring below the probe's floor
    expect(parseAvatarLook(`${base}-c-f7d154-2-15-6-2-3`)).toBeNull();
    expect(parseAvatarLook(`${base}-c-f7d154-2-8-13-2-3`)).toBeNull(); // petals above the max
    expect(parseAvatarLook(`${base}-c-f7d154-2-8-6-6-3`)).toBeNull();  // depth above the max
    expect(parseAvatarLook(`${base}-nothex-2-8-6-2-3`)).toBeNull();
  });

  it('leaves the spiral entirely alone', () => {
    // The reason four self-contained functions were chosen over one generator with a mode:
    // a code with a `c` in it and a code with an `s` in it cannot influence one another.
    const spiral = avatarSvg({ ...someone, avatarLook: `${base}-s-f7d154-12-4` });
    expect(avatarSvg({ ...someone, avatarLook: `${base}-s-f7d154-12-4` })).toBe(spiral);
    expect(avatarSvg({ ...someone, avatarLook: `${base}-c-f7d154-2-8-6-2-3` })).not.toBe(spiral);
  });

  it('draws rings: a walk out from the centre crosses bands, a walk around does not', () => {
    // Plain rings (no petals) are radially symmetric BY CONSTRUCTION, and that is the property
    // that distinguishes this pattern from the spiral — which is the exact opposite.
    // `lobeDepth: 0` as well as `lobes: 0` — with depth left on, the rose term is a constant
    // 1.2 and radius 20 lands the sample on distance 24.0, exactly a band boundary, where
    // floating-point noise decides the answer. A test should not be balanced on an edge.
    const plain = { ...rings, lobes: 0, lobeDepth: 0, shape: 2 };
    const around = new Set(
      Array.from({ length: 360 }, (_unused, degree) => {
        const theta = (degree / 360) * Math.PI * 2;
        return concentricBandOfCell(
          { x: 31.5 + Math.cos(theta) * 20, y: 31.5 + Math.sin(theta) * 20 }, 64, plain);
      }),
    );
    expect(around.size).toBe(1);

    const outwards = new Set(
      [2, 10, 18, 26].map((radius) => concentricBandOfCell({ x: 31.5 + radius, y: 31.5 }, 64, plain)),
    );
    expect(outwards.size).toBeGreaterThan(1);
  });

  it('petals break that symmetry, and more petals break it more often', () => {
    const flips = (lobes: number) => {
      const walk = Array.from({ length: 720 }, (_unused, step) => {
        const theta = (step / 720) * Math.PI * 2;
        return concentricBandOfCell(
          { x: 31.5 + Math.cos(theta) * 22, y: 31.5 + Math.sin(theta) * 22 }, 64,
          { ...rings, lobes, lobeDepth: 5 });
      });
      return walk.filter((band, index) => band !== walk[(index + 1) % walk.length]).length;
    };
    expect(flips(0)).toBe(0);
    expect(flips(6)).toBeGreaterThan(0);
    expect(flips(12)).toBeGreaterThan(flips(6));
  });

  it('gives each shape its own silhouette', () => {
    // A diamond, a circle and a square disagree about what is near. Sampling the corner of the
    // grid against a point the same Euclidean distance away on the axis says so without
    // asserting any particular pixel.
    const at = (shape: number, x: number, y: number) =>
      concentricBandOfCell({ x, y }, 64, { ...rings, lobes: 0, shape, bands: 4 });
    expect(at(1, 50, 50)).not.toBe(at(4, 50, 50));
  });

  it('never wraps the centre cell to the outermost colour', () => {
    // The deepest petal setting drives the rose term towards zero; a negative distance there
    // would put one wrong pixel in the exact middle of a face, which is where people look.
    for (let lobes = 0; lobes <= 12; lobes += 1) {
      expect(concentricBandOfCell({ x: 31.5, y: 31.5 }, 64,
        { ...rings, lobes, lobeDepth: 5, bands: 4 })).toBe(0);
    }
  });
});

/**
 * ADR-208 — ⚡ chevron & bargello: the first LINEAR pattern, so the first one whose bands are
 * not organised around the centre at all.
 */
describe('chevron and bargello waves (ADR-208)', () => {
  const someone = {
    gender: 'male' as const,
    avatarVariant: 3,
    avatarPhoto: null,
    avatarLook: null as string | null,
  };
  const base = '3-1-2-1-3-1f4e9c-1d5b8c';
  const waves = { kind: 'waves' as const, colourTwo: '#f7d154', bands: 3,
    wave: 1, period: 24, amplitude: 4, bandHeight: 8 };

  it('round-trips through the wire format at fixed arity', () => {
    const look = { ...readAvatarLook(base), sunburst: waves };
    expect(formatAvatarLook(look)).toBe(`${base}-w-f7d154-1-24-4-8-3`);
    expect(parseAvatarLook(`${base}-w-f7d154-1-24-4-8-3`)?.sunburst).toEqual(waves);
  });

  it('refuses a short, long or out-of-range group rather than guessing', () => {
    expect(parseAvatarLook(`${base}-w-f7d154-1-24-4-8`)).toBeNull();
    expect(parseAvatarLook(`${base}-w-f7d154-1-24-4-8-3-1`)).toBeNull();
    expect(parseAvatarLook(`${base}-w-f7d154-3-24-4-8-3`)).toBeNull();  // no third waveform
    expect(parseAvatarLook(`${base}-w-f7d154-1-11-4-8-3`)).toBeNull();  // below the period floor
    expect(parseAvatarLook(`${base}-w-f7d154-1-49-4-8-3`)).toBeNull();
    expect(parseAvatarLook(`${base}-w-f7d154-1-24-8-8-3`)).toBeNull();  // amplitude past 70%
    expect(parseAvatarLook(`${base}-w-f7d154-1-24-4-5-3`)).toBeNull();  // band below the floor
    expect(parseAvatarLook(`${base}-w-f7d154-1-24-4-17-3`)).toBeNull();
  });

  it('keeps every band index inside the band count, above and below the centre', () => {
    // `v - offset` is negative over the top half and JavaScript's `%` keeps the dividend's
    // sign, so the naive remainder hands back negative indices for half of every avatar --
    // which is an unpainted band across the top of somebody's face.
    for (const bands of [2, 3, 4]) {
      for (let y = 0; y < 64; y += 1) {
        for (let x = 0; x < 64; x += 7) {
          const band = wavesBandOfCell({ x, y }, 64, { ...waves, bands, amplitude: 7 });
          expect(band).toBeGreaterThanOrEqual(0);
          expect(band).toBeLessThan(bands);
        }
      }
    }
  });

  it('draws plain horizontal stripes at amplitude zero', () => {
    // The probe asked for stripes by name; they are not a special case in the code, they are
    // what the same expression does when the wave is multiplied by nothing. A row is one
    // colour all the way across, and walking DOWN still crosses bands.
    const stripes = { ...waves, amplitude: 0 };
    const row = new Set(
      Array.from({ length: 64 }, (_unused, x) => wavesBandOfCell({ x, y: 20 }, 64, stripes)),
    );
    expect(row.size).toBe(1);
    const column = new Set(
      Array.from({ length: 64 }, (_unused, y) => wavesBandOfCell({ x: 20, y }, 64, stripes)),
    );
    expect(column.size).toBe(3);
  });

  it('bends those stripes once amplitude is dialled up', () => {
    const bent = new Set(
      Array.from({ length: 64 }, (_unused, x) => wavesBandOfCell({ x, y: 20 }, 64, waves)),
    );
    expect(bent.size).toBeGreaterThan(1);
  });

  it('repeats exactly once per period, whichever waveform is chosen', () => {
    // The defining property of both: the pattern at u and at u + period is identical. It is
    // what makes "wave width" an honest label on the control.
    for (const wave of [1, 2]) {
      for (let x = 0; x < 24; x += 1) {
        const here = wavesBandOfCell({ x, y: 13 }, 64, { ...waves, wave });
        expect(wavesBandOfCell({ x: x + 24, y: 13 }, 64, { ...waves, wave })).toBe(here);
      }
    }
  });

  it('gives the chevron corners the bargello does not have', () => {
    // A triangle wave's slope is constant and flips sign at the crest; a sine's slope changes
    // everywhere. Sampling the offset profile through the two shows they are different
    // functions rather than two names for the same picture.
    const profile = (wave: number) =>
      Array.from({ length: 48 }, (_unused, x) =>
        wavesBandOfCell({ x, y: 32 }, 64, { ...waves, wave, bands: 4, amplitude: 7 }));
    expect(profile(1)).not.toEqual(profile(2));
  });

  it('leaves the other two patterns alone', () => {
    const spiral = avatarSvg({ ...someone, avatarLook: `${base}-s-f7d154-12-4` });
    const rings = avatarSvg({ ...someone, avatarLook: `${base}-c-f7d154-2-8-6-2-3` });
    const bars = avatarSvg({ ...someone, avatarLook: `${base}-w-f7d154-1-24-4-8-3` });
    expect(new Set([spiral, rings, bars]).size).toBe(3);
  });
});

/**
 * ADR-209 — 🌀 psychedelic swirls: the fourth pattern and the only WARPED one, so the only one
 * whose bands are not level sets of anything you can write down in closed form.
 */
describe('psychedelic swirls and groovy waves (ADR-209)', () => {
  const someone = {
    gender: 'male' as const,
    avatarVariant: 3,
    avatarPhoto: null,
    avatarLook: null as string | null,
  };
  const base = '3-1-2-1-3-1f4e9c-1d5b8c';
  const swirls = { kind: 'psychedelic' as const, colourTwo: '#f7d154', bands: 3,
    swirl: 1, frequency: 2, ripple: 6, scale: 8 };

  it('round-trips through the wire format at fixed arity', () => {
    const look = { ...readAvatarLook(base), sunburst: swirls };
    expect(formatAvatarLook(look)).toBe(`${base}-p-f7d154-1-2-6-8-3`);
    expect(parseAvatarLook(`${base}-p-f7d154-1-2-6-8-3`)?.sunburst).toEqual(swirls);
  });

  it('refuses a short, long or out-of-range group rather than guessing', () => {
    expect(parseAvatarLook(`${base}-p-f7d154-1-2-6-8`)).toBeNull();
    expect(parseAvatarLook(`${base}-p-f7d154-1-2-6-8-3-1`)).toBeNull();
    expect(parseAvatarLook(`${base}-p-f7d154-7-2-6-8-3`)).toBeNull();   // swirl past the max
    expect(parseAvatarLook(`${base}-p-f7d154-1-0-6-8-3`)).toBeNull();   // frequency below one
    expect(parseAvatarLook(`${base}-p-f7d154-1-6-6-8-3`)).toBeNull();
    expect(parseAvatarLook(`${base}-p-f7d154-1-2-11-8-3`)).toBeNull();  // ripple past 100%
    expect(parseAvatarLook(`${base}-p-f7d154-1-2-6-3-3`)).toBeNull();   // band below the floor
    expect(parseAvatarLook(`${base}-p-f7d154-1-2-6-15-3`)).toBeNull();
  });

  it('closes the colour cycle across the angle wrap, at every setting', () => {
    // THE failure mode of this pattern. `theta` jumps by 2*pi across the negative x-axis, so
    // the running total jumps by the arm count; unless that is a whole number of colour
    // cycles the avatar gets a hard radial seam straight through it. Arms are deliberately
    // `swirl * bands` so the jump always closes -- this walks the seam on both sides and
    // across every combination of the two knobs that decide it.
    for (let bands = 2; bands <= 4; bands += 1) {
      for (let swirl = 0; swirl <= 6; swirl += 1) {
        const pattern = { ...swirls, bands, swirl, ripple: 0 };
        for (let x = 0; x < 32; x += 1) {
          // Straddle the wrap itself rather than two neighbouring cells. The centre line is
          // y = 31.5 in cell coordinates, and `atan2(0, negative)` is +pi, so the cells at
          // y = 31 and y = 32 are both on the SAME side of the cut -- the first draft of this
          // test compared them and failed for that reason, not for a seam. These two samples
          // differ ONLY by the 2*pi wrap, so any difference in band is the seam and nothing
          // else; two adjacent cells may legitimately differ wherever a band happens to end.
          const before = psychedelicBandOfCell({ x, y: 31.5 - 1e-6 }, 64, pattern);
          const after = psychedelicBandOfCell({ x, y: 31.5 + 1e-6 }, 64, pattern);
          expect(after).toBe(before);
        }
      }
    }
  });

  it('keeps every band index inside the band count', () => {
    for (const bands of [2, 3, 4]) {
      for (let y = 0; y < 64; y += 3) {
        for (let x = 0; x < 64; x += 3) {
          const band = psychedelicBandOfCell({ x, y }, 64, { ...swirls, bands, ripple: 10 });
          expect(band).toBeGreaterThanOrEqual(0);
          expect(band).toBeLessThan(bands);
        }
      }
    }
  });

  it('warps: with ripple off the field is radially symmetric, with it on it is not', () => {
    // At swirl 0 and ripple 0 this degenerates to plain rings, which is a good check that the
    // warp is the ONLY thing making it liquid rather than some accident of the arithmetic.
    const still = { ...swirls, swirl: 0, ripple: 0 };
    const ring = new Set(
      Array.from({ length: 180 }, (_unused, step) => {
        const theta = (step / 180) * Math.PI * 2;
        return psychedelicBandOfCell(
          { x: 31.5 + Math.cos(theta) * 17, y: 31.5 + Math.sin(theta) * 17 }, 64, still);
      }),
    );
    expect(ring.size).toBe(1);

    const rippled = new Set(
      Array.from({ length: 180 }, (_unused, step) => {
        const theta = (step / 180) * Math.PI * 2;
        return psychedelicBandOfCell(
          { x: 31.5 + Math.cos(theta) * 17, y: 31.5 + Math.sin(theta) * 17 },
          64, { ...still, ripple: 10 });
      }),
    );
    expect(rippled.size).toBeGreaterThan(1);
  });

  it('is mirrored about the diagonal, which is what reading each axis off the other costs', () => {
    // Pinned because it was found by a test that asserted the OPPOSITE and was wrong to.
    // Displacing u by a wave in v and v by a wave in u is symmetric under swapping them, and
    // since the radius is too, the whole pattern has a mirror line along y = x. That is a
    // real visible property of this backdrop, it is harmless behind a face, and it is not
    // something to discover later by accident -- so it is asserted rather than regretted.
    const pattern = { ...swirls, swirl: 0, ripple: 10, frequency: 3, bands: 4 };
    for (let x = 0; x < 64; x += 5) {
      for (let y = 0; y < 64; y += 5) {
        expect(psychedelicBandOfCell({ x: y, y: x }, 64, pattern))
          .toBe(psychedelicBandOfCell({ x, y }, 64, pattern));
      }
    }
  });

  it('bends bands along their length instead of sliding them sideways', () => {
    // The point of reading each displacement off the OTHER coordinate. Along one row the
    // x-displacement is a constant -- it depends only on v -- while the y-displacement varies
    // with x. A warp that took both from the same variable would shift each row rigidly and
    // leave the band count along it unchanged; bending adds crossings.
    const crossings = (ripple: number) => {
      const row = Array.from({ length: 64 }, (_unused, x) =>
        psychedelicBandOfCell({ x, y: 44 }, 64,
          { ...swirls, swirl: 0, ripple, frequency: 4, scale: 14, bands: 4 }));
      return row.filter((band, i) => i > 0 && band !== row[i - 1]).length;
    };
    expect(crossings(10)).toBeGreaterThan(crossings(0));
  });

  it('scales the ripple down as waviness goes up, so no pairing turns to mush', () => {
    // The probe's coupling: w*f^2 <= 0.8. At full ripple the EFFECTIVE displacement must fall
    // as frequency rises -- which is the whole reason the control is a percentage. Measured
    // through the public function: a finer warp must not destroy more bands than a coarse one.
    const distinct = (frequency: number) =>
      new Set(Array.from({ length: 64 }, (_unused, x) =>
        psychedelicBandOfCell({ x, y: 32 }, 64,
          { ...swirls, swirl: 0, ripple: 10, frequency, bands: 4 }))).size;
    expect(distinct(5)).toBeGreaterThan(1);
    expect(distinct(1)).toBeGreaterThan(1);
  });

  it('leaves the other three patterns alone', () => {
    const looks = [
      `${base}-s-f7d154-12-4`,
      `${base}-c-f7d154-2-8-6-2-3`,
      `${base}-w-f7d154-1-24-4-8-3`,
      `${base}-p-f7d154-1-2-6-8-3`,
    ].map((avatarLook) => avatarSvg({ ...someone, avatarLook }));
    expect(new Set(looks).size).toBe(4);
  });
});

describe('look codes', () => {
  it('round-trips through the wire format', () => {
    const look = {
      skinTone: 8, hairStyle: 5, hairColour: 10, facialHair: 3, build: 4,
      outfitColour: '#ff00aa', backdrop: '#012345', sunburst: null,
    };
    expect(formatAvatarLook(look)).toBe('8-5-10-3-4-ff00aa-012345');
    expect(parseAvatarLook('8-5-10-3-4-ff00aa-012345')).toEqual(look);
  });

  it('still reads codes written before the colour wheel and the build (ADR-028/029)', () => {
    // Index 9 was Charcoal, index 3 was Indigo, and there was no build: the same face,
    // written two formats ago.
    expect(parseAvatarLook('3-1-2-1-9-3')).toEqual({
      skinTone: 3, hairStyle: 1, hairColour: 2, facialHair: 1, build: 3,
      outfitColour: '#333b49', backdrop: '#33477a', sunburst: null,
    });
    expect(formatAvatarLook(readAvatarLook('3-1-2-1-9-3'))).toBe('3-1-2-1-3-333b49-33477a');
    // And a code from between the two changes: colours, but still no build.
    expect(formatAvatarLook(readAvatarLook('3-1-2-1-ff7ac3-0b0f1a')))
      .toBe('3-1-2-1-3-ff7ac3-0b0f1a');
  });

  it('carries a TAGGED pattern on the end, and omits it when there is none (ADR-173/205)', () => {
    const look = {
      skinTone: 8, hairStyle: 5, hairColour: 10, facialHair: 3, build: 4,
      outfitColour: '#ff00aa', backdrop: '#012345',
      sunburst: { kind: 'spiral' as const, colourTwo: '#f7d154', rays: 18, twist: 7, bands: 2 },
    };
    // ADR-205 — the group opens with `s`, so it says which pattern it is rather than leaving
    // that to be inferred from how many parts happen to follow.
    expect(formatAvatarLook(look)).toBe('8-5-10-3-4-ff00aa-012345-s-f7d154-18-7');
    expect(parseAvatarLook('8-5-10-3-4-ff00aa-012345-s-f7d154-18-7')).toEqual(look);
    // And the untagged form it replaces still reads, because stored codes are never rewritten.
    expect(parseAvatarLook('8-5-10-3-4-ff00aa-012345-f7d154-18-7')).toEqual(look);
  });

  /*
   * ADR-205 — the back-compatibility rule, proved by EXHAUSTION rather than by sampling.
   *
   * Legacy spiral space is small enough to enumerate outright: rays 3…24 by twist 0…10 is 242
   * codes, and every one of them has to keep meaning what it meant. Checking three of them by
   * hand would leave the other 239 resting on an argument, and an argument is exactly what
   * ADR-203 showed is not worth having about a property a loop can settle.
   *
   * Parse equality is the whole proof: the rendered avatar is a pure function of the parsed
   * look (`avatarSvg` reads nothing else), so two codes that parse identically cannot draw
   * differently. There is no need to render 242 SVGs to know that.
   */
  it('reads all 242 legacy spiral codes identically to their tagged form (ADR-205)', () => {
    const base = '3-1-2-1-3-1f4e9c-1d5b8c';
    let checked = 0;
    for (let rays = SUNBURST_RAYS_MIN; rays <= SUNBURST_RAYS_MAX; rays += 1) {
      for (let twist = SUNBURST_TWIST_MIN; twist <= SUNBURST_TWIST_MAX; twist += 1) {
        const legacy = parseAvatarLook(`${base}-f7d154-${rays}-${twist}`);
        expect(legacy).not.toBeNull();
        expect(legacy?.sunburst).toEqual({ kind: 'spiral', colourTwo: '#f7d154', rays, twist, bands: 2 });
        // Identical to the tagged form...
        expect(parseAvatarLook(`${base}-s-f7d154-${rays}-${twist}`)).toEqual(legacy);
        // ...and re-minting a legacy code produces the tagged one, losing nothing.
        expect(formatAvatarLook(required(legacy, 'legacy look')))
          .toBe(`${base}-s-f7d154-${rays}-${twist}`);
        checked += 1;
      }
    }
    expect(checked).toBe(242);
  });

  it('refuses a tag it does not know rather than guessing at the parts (ADR-205)', () => {
    const base = '3-1-2-1-3-1f4e9c-1d5b8c';
    // The point of the tag: an unknown pattern is an ERROR, not three numbers read hopefully.
    expect(parseAvatarLook(`${base}-q-f7d154-18-7`)).toBeNull();
    expect(parseAvatarLook(`${base}-s`)).toBeNull();
    expect(parseAvatarLook(`${base}-s-f7d154-18`)).toBeNull();
    expect(parseAvatarLook(`${base}-s-f7d154-18-7-2-9`)).toBeNull();
    // ADR-206 — the band count is the fourth part, and it has its own range.
    expect(parseAvatarLook(`${base}-s-f7d154-18-7-1`)).toBeNull();  // below SUNBURST_BANDS_MIN
    expect(parseAvatarLook(`${base}-s-f7d154-18-7-5`)).toBeNull();  // above SUNBURST_BANDS_MAX
    expect(parseAvatarLook(`${base}-s-f7d154-18-7-4`)?.sunburst?.bands).toBe(4);
    expect(parseAvatarLook(`${base}-s-nothex-18-7`)).toBeNull();
    expect(parseAvatarLook(`${base}-s-f7d154-25-7`)).toBeNull();
  });

  it('reads every code minted before the sunburst as a plain backdrop (ADR-173)', () => {
    // The point of appending: the backdrop a participant already chose is colour one, and no
    // stored code changes meaning. Both older formats keep working too.
    expect(parseAvatarLook('3-1-2-1-3-1f4e9c-1d5b8c')?.sunburst).toBeNull();
    expect(parseAvatarLook('3-1-2-1-9-3')?.sunburst).toBeNull();
    expect(formatAvatarLook(readAvatarLook('3-1-2-1-3-1f4e9c-1d5b8c')))
      .toBe('3-1-2-1-3-1f4e9c-1d5b8c');
  });

  it('refuses a half-written or out-of-range sunburst rather than guessing (ADR-173)', () => {
    const base = '3-1-2-1-3-1f4e9c-1d5b8c';
    expect(parseAvatarLook(`${base}-f7d154`)).toBeNull();
    expect(parseAvatarLook(`${base}-f7d154-18`)).toBeNull();
    expect(parseAvatarLook(`${base}-f7d154-18-7-9`)).toBeNull();
    expect(parseAvatarLook(`${base}-nothex-18-7`)).toBeNull();
    expect(parseAvatarLook(`${base}-f7d154-2-7`)).toBeNull();   // below SUNBURST_RAYS_MIN
    expect(parseAvatarLook(`${base}-f7d154-25-7`)).toBeNull();  // above SUNBURST_RAYS_MAX
    expect(parseAvatarLook(`${base}-f7d154-18-11`)).toBeNull(); // above SUNBURST_TWIST_MAX
    expect(parseAvatarLook(`${base}-f7d154-18--1`)).toBeNull();
    expect(parseAvatarLook(`${base}-f7d154-7.5-7`)).toBeNull();
    // The boundaries themselves are good.
    expect(parseAvatarLook(`${base}-f7d154-3-0`)?.sunburst).toEqual({
      kind: 'spiral', colourTwo: '#f7d154', rays: 3, twist: 0, bands: 2,
    });
    expect(parseAvatarLook(`${base}-f7d154-24-10`)?.sunburst)
      .toMatchObject({ kind: 'spiral', rays: 24, twist: 10 });
  });

  it('takes a colour however the picker wrote it, or not at all', () => {
    expect(asAvatarColour('#1F4E9C')).toBe('#1f4e9c');
    expect(asAvatarColour('1f4e9c')).toBe('#1f4e9c');
    expect(asAvatarColour(' #1f4e9c ')).toBe('#1f4e9c');
    expect(asAvatarColour('#fff')).toBeNull();
    expect(asAvatarColour('rebeccapurple')).toBeNull();
  });

  it('rejects codes that are the wrong shape or out of range', () => {
    expect(parseAvatarLook('1-1-1-1-1')).toBeNull();
    expect(parseAvatarLook('1-1-1-1-1-1-1-1')).toBeNull();
    expect(parseAvatarLook('0-1-1-1-1-1')).toBeNull();
    expect(parseAvatarLook('9-1-1-1-1-1')).toBeNull();
    expect(parseAvatarLook('1-1-1-1-1-x')).toBeNull();
    expect(parseAvatarLook('1.5-1-1-1-1-1')).toBeNull();
    expect(parseAvatarLook('1-1-1-1-1-11-1')).toBeNull();
    expect(parseAvatarLook('1-1-1-1-1-1f4e9c-nothex')).toBeNull();
    expect(parseAvatarLook('1-1-1-1-9-1f4e9c-1d5b8c')).toBeNull();
  });

  it('reads a missing or broken code as the default look', () => {
    expect(readAvatarLook(null)).toEqual(parseAvatarLook(DEFAULT_AVATAR_LOOK_CODE));
    expect(readAvatarLook(undefined)).toEqual(readAvatarLook(''));
    expect(readAvatarLook('nope')).toEqual(readAvatarLook(DEFAULT_AVATAR_LOOK_CODE));
  });
});

describe('persona presets', () => {
  const preset = (variant: number) => AVATAR_PERSONA_PRESETS[variant - 1];

  it('brings the new kit when the wearer has not chosen for themselves', () => {
    const look = readAvatarLook(formatAvatarLook({ ...readAvatarLook(null), ...preset(1) }));

    expect(personaLook(look, 1, 4)).toMatchObject(
      { outfitColour: preset(4)?.outfitColour, backdrop: preset(4)?.backdrop },
    );
  });

  it('never overwrites a colour the participant picked', () => {
    // On persona 2, then shirt and backdrop chosen by hand, then persona 5 tried on.
    const chosen = { ...readAvatarLook(null), ...preset(2), outfitColour: '#00ffcc', backdrop: '#220044' };

    expect(personaLook(chosen, 2, 5)).toMatchObject({ outfitColour: '#00ffcc', backdrop: '#220044' });
    // Everything else about them is untouched too.
    expect(personaLook(chosen, 2, 5)).toMatchObject({ skinTone: chosen.skinTone, hairStyle: chosen.hairStyle });
  });

  it('moves only the axis still sitting on the old preset', () => {
    const half = { ...readAvatarLook(null), ...preset(3), backdrop: '#101010' };

    expect(personaLook(half, 3, 1)).toMatchObject(
      { outfitColour: preset(1)?.outfitColour, backdrop: '#101010' },
    );
  });

  it('clamps a variant it could never draw back to the first character', () => {
    const look = readAvatarLook(null);

    expect(personaLook(look, 0, 99)).toEqual(look);
  });
});

describe('picker options', () => {
  it('pairs every contract label with a colour from the art', () => {
    const skins = swatchOptions('skinTone', AVATAR_SKIN_TONES);
    expect(skins).toHaveLength(AVATAR_SKIN_TONES.length);
    expect(skins[0]).toEqual({ value: 1, label: 'Porcelain', colour: SKIN_TONES[0]?.base });
  });

  it('keeps the label lists and the palettes the same length', () => {
    // Contracts owns the names, the generated art owns the colours: they must not drift.
    expect(SKIN_TONES).toHaveLength(AVATAR_SKIN_TONES.length);
    expect(HAIR_COLOURS).toHaveLength(10);
    expect(OUTFIT_COLOURS).toHaveLength(10);
    expect(BACKDROP_COLOURS).toHaveLength(10);
  });
});

describe('nextVariant (ADR-227)', () => {
  it('moves to the next character, and the last wraps to the first', () => {
    expect([1, 2, 3, 4, 5].map(nextVariant)).toEqual([2, 3, 4, 5, 1]);
  });

  it('draws something for a variant the server should never send', () => {
    expect(nextVariant(0)).toBe(2);
    expect(nextVariant(9)).toBe(2);
  });
});
