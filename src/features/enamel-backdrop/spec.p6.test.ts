// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';

import { ENAMEL_PALETTES, SPEC_KNOBS, DEFAULT_BACKDROPS, DEFAULT_PATTERNS, PATTERN_KNOBS } from './palettes';

import { describeKnob, isPaletteActive, paletteStops, patternKnobValue, specKnobValue, withColours, withInlay, withPalette, withPatternKind, withPatternKnob, withSpecKnob } from './spec';

import { type BackdropSpec } from './types';

const base = (): BackdropSpec => ({ ...DEFAULT_BACKDROPS[0].spec });
describe('pattern edits', () => {
  it('swaps in the reference defaults for a new pattern', () => {
    const next = withPatternKind(base(), 'chevron');

    expect(next.pattern).toEqual(DEFAULT_PATTERNS.chevron);
  });

  it('returns the same spec when the pattern is unchanged', () => {
    const spec = base();

    expect(withPatternKind(spec, spec.pattern.kind)).toBe(spec);
  });

  it('steps a knob to its grid and clamps it to the range', () => {
    const rays = PATTERN_KNOBS.sunburst[0];
    const [low, high] = [rays.min, rays.max];

    expect(withPatternKnob(base(), { key: 'rays', value: 7 }).pattern).toMatchObject({ rays: 7 });
    expect(withPatternKnob(base(), { key: 'rays', value: high + 40 }).pattern).toMatchObject({
      rays: high,
    });
    expect(withPatternKnob(base(), { key: 'rays', value: low - 40 }).pattern).toMatchObject({
      rays: low,
    });
  });

  it('ignores an unknown knob or a non-finite value', () => {
    const spec = base();

    expect(withPatternKnob(spec, { key: 'nope', value: 3 })).toBe(spec);
    expect(withPatternKnob(spec, { key: 'rays', value: Number.NaN })).toBe(spec);
  });

  it('reads a knob value, defaulting to zero', () => {
    expect(patternKnobValue({ kind: 'sunburst', rays: 9, twist: 2 }, 'rays')).toBe(9);
    expect(patternKnobValue({ kind: 'sunburst', rays: 9, twist: 2 }, 'missing')).toBe(0);
  });
});
describe('finish edits', () => {
  it('rounds a finish knob to its step and three decimals', () => {
    const gilt = SPEC_KNOBS.gilt;

    expect(withSpecKnob(base(), { knob: 'gilt', value: 0.53 }).gilt).toBe(0.55);
    expect(withSpecKnob(base(), { knob: 'gilt', value: 9 }).gilt).toBe(gilt.max);
    expect(withSpecKnob(base(), { knob: 'gilt', value: -4 }).gilt).toBe(gilt.min);
  });

  it('ignores a non-finite finish value', () => {
    const spec = base();

    expect(withSpecKnob(spec, { knob: 'wireWidth', value: Number.POSITIVE_INFINITY })).toBe(spec);
  });

  it('reads a finish knob, treating optional ones as zero', () => {
    const spec = base();

    expect(specKnobValue(spec, 'wireWidth')).toBe(spec.wireWidth ?? 0);
    const partial: BackdropSpec = { ...spec };
    delete (partial as { leafDensity?: number }).leafDensity;
    expect(specKnobValue(partial, 'leafDensity')).toBe(0);
  });
});
describe('palette edits', () => {
  it('takes both enamels from a classic palette and clears the accents', () => {
    const classic = ENAMEL_PALETTES[0];
    const next = withPalette(base(), classic);

    expect(next.colourOne).toBe(classic.colourOne);
    expect(next.colourTwo).toBe(classic.colourTwo);
    expect(next.accents).toEqual([]);
  });

  it('keeps a jewel palette’s middle enamels', () => {
    const jewel = ENAMEL_PALETTES.find((palette) => (palette.accents ?? []).length > 0)!;
    const next = withPalette(base(), jewel);

    expect(next.accents).toEqual(jewel.accents);
    expect(paletteStops(jewel)).toEqual([
      jewel.colourOne,
      ...(jewel.accents ?? []),
      jewel.colourTwo,
    ]);
  });

  it('accepts only six-digit hex colours', () => {
    const spec = base();

    const next = withColours(spec, { colourOne: '#A1B2C3', colourTwo: 'red' });

    expect(next.colourOne).toBe('#A1B2C3');
    expect(next.colourTwo).toBe(spec.colourTwo);
    expect(withColours(spec, { colourOne: undefined, colourTwo: undefined })).toEqual(spec);
  });

  it('switches the inlay only when it changes', () => {
    const spec = { ...base(), inlay: 'cloisonne' as const };

    expect(withInlay(spec, 'gilded-bands').inlay).toBe('gilded-bands');
    expect(withInlay(spec, 'cloisonne')).toBe(spec);
  });

  it('reads a missing inlay as cloisonné', () => {
    const spec = base();

    expect(withInlay(spec, 'cloisonne')).toBe(spec);
  });

  it('recognises the active palette, case-insensitively', () => {
    const classic = ENAMEL_PALETTES[0];
    const spec = withPalette(base(), classic);

    expect(isPaletteActive(spec, classic)).toBe(true);
    expect(isPaletteActive({ ...spec, colourOne: '#000000' }, classic)).toBe(false);
    expect(isPaletteActive({ ...spec, accents: ['#ffffff'] }, classic)).toBe(false);
  });
});
describe('knob copy', () => {
  it('names radiance shapes and chevron stitches', () => {
    expect(describeKnob({ ...DEFAULT_PATTERNS.radiance, shape: 1 }, 'shape')).toBe('Diamond');
    expect(describeKnob({ ...DEFAULT_PATTERNS.radiance, shape: 4 }, 'shape')).toBe('Square');
    expect(describeKnob({ ...DEFAULT_PATTERNS.chevron, wave: 1 }, 'wave')).toBe('Chevron');
    expect(describeKnob({ ...DEFAULT_PATTERNS.chevron, wave: 2 }, 'wave')).toBe('Bargello');
  });

  it('clamps an out-of-range named value instead of throwing', () => {
    expect(describeKnob({ ...DEFAULT_PATTERNS.radiance, shape: 99 }, 'shape')).toBe('Square');
    expect(describeKnob({ ...DEFAULT_PATTERNS.chevron, wave: 0 }, 'wave')).toBe('Chevron');
  });

  it('falls back to the bare number for every other knob', () => {
    expect(describeKnob(DEFAULT_PATTERNS.sunburst, 'rays')).toBe('12');
    expect(describeKnob(DEFAULT_PATTERNS.radiance, 'ringWidth')).toBe('8');
  });
});
