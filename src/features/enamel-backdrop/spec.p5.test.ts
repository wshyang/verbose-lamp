// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';

import { ENAMEL_PALETTES, DEFAULT_BACKDROPS, DEFAULT_PATTERNS, JEWEL_BACKDROPS } from './palettes';

import { describeKnob, isPaletteActive, paletteStops, patternKnobValue, specKnobValue, withColours, withInlay, withPalette, withPatternKind, withPatternKnob, withSpecKnob } from './spec';

import { type EnamelPalette } from './types';

const emeraldSunburst = DEFAULT_BACKDROPS[0].spec;
const peacockFan = JEWEL_BACKDROPS[0].spec;
const paletteById = (id: string): EnamelPalette =>
  ENAMEL_PALETTES.find((palette) => palette.id === id) as EnamelPalette;
const emerald = paletteById('emerald-ballroom');
const peacock = paletteById('peacock');
describe('pattern edits', () => {
  it('keeps the same object when the kind is unchanged, swaps defaults otherwise', () => {
    expect(withPatternKind(emeraldSunburst, 'sunburst')).toBe(emeraldSunburst);
    const changed = withPatternKind(emeraldSunburst, 'fan');
    expect(changed.pattern).toBe(DEFAULT_PATTERNS.fan);
    expect(changed.colourOne).toBe(emeraldSunburst.colourOne);
  });

  it('steps and clamps pattern knobs, ignoring unknown or non-finite changes', () => {
    const clamped = withPatternKnob(emeraldSunburst, { key: 'rays', value: 99 });
    expect(patternKnobValue(clamped.pattern, 'rays')).toBe(24);
    const stepped = withPatternKnob(emeraldSunburst, { key: 'twist', value: 4.4 });
    expect(patternKnobValue(stepped.pattern, 'twist')).toBe(4);
    expect(withPatternKnob(emeraldSunburst, { key: 'sparkle', value: 3 })).toBe(emeraldSunburst);
    expect(withPatternKnob(emeraldSunburst, { key: 'rays', value: Number.NaN })).toBe(emeraldSunburst);
  });

  it('steps and clamps finish knobs, ignoring non-finite changes', () => {
    expect(withSpecKnob(emeraldSunburst, { knob: 'gilt', value: 0.37 }).gilt).toBe(0.35);
    expect(withSpecKnob(emeraldSunburst, { knob: 'bands', value: 99 }).bands).toBe(4);
    expect(withSpecKnob(emeraldSunburst, { knob: 'gilt', value: Number.POSITIVE_INFINITY })).toBe(emeraldSunburst);
  });
});
describe('colour edits', () => {
  it('applies a palette with or without jewel accents', () => {
    const plain = withPalette(peacockFan, emerald);
    expect(plain).toMatchObject({ colourOne: emerald.colourOne, colourTwo: emerald.colourTwo, accents: [] });
    const jewel = withPalette(emeraldSunburst, peacock);
    expect(jewel.accents).toEqual(peacock.accents);
    expect(emeraldSunburst.colourOne).toBe(emerald.colourOne);
  });

  it('accepts only full hex colours, keeping the old enamel otherwise', () => {
    const changed = withColours(emeraldSunburst, { colourOne: '#A1B2C3', colourTwo: '#102030' });
    expect(changed.colourOne).toBe('#A1B2C3');
    const kept = withColours(emeraldSunburst, { colourOne: 'emerald', colourTwo: undefined });
    expect(kept.colourOne).toBe(emeraldSunburst.colourOne);
    expect(kept.colourTwo).toBe(emeraldSunburst.colourTwo);
    expect(withColours(emeraldSunburst, { colourOne: '#12345' }).colourOne).toBe(emeraldSunburst.colourOne);
  });

  it('treats a missing inlay as cloisonné when deciding whether anything changed', () => {
    expect(withInlay(emeraldSunburst, 'cloisonne')).toBe(emeraldSunburst);
    expect(withInlay(emeraldSunburst, 'gilded-bands').inlay).toBe('gilded-bands');
    expect(withInlay(peacockFan, 'gilded-bands')).toBe(peacockFan);
    expect(withInlay(peacockFan, 'cloisonne').inlay).toBe('cloisonne');
  });
});
describe('knob reads', () => {
  it('reads numeric pattern knobs and tolerates absent or textual keys', () => {
    expect(patternKnobValue(DEFAULT_PATTERNS.sunburst, 'rays')).toBe(12);
    expect(patternKnobValue(DEFAULT_PATTERNS.sunburst, 'lift')).toBe(0);
    expect(patternKnobValue(DEFAULT_PATTERNS.sunburst, 'kind')).toBe(0);
  });

  it('reads finish knobs, with optional knobs reading as 0', () => {
    expect(specKnobValue(emeraldSunburst, 'gilt')).toBe(0.35);
    expect(specKnobValue(emeraldSunburst, 'guilloche')).toBe(0);
    expect(specKnobValue(peacockFan, 'guilloche')).toBe(0.6);
  });

  it('names ring shapes and stitches instead of numbering them', () => {
    expect(describeKnob(DEFAULT_PATTERNS.radiance, 'shape')).toBe('Circle');
    expect(describeKnob({ ...DEFAULT_PATTERNS.radiance, shape: 1 }, 'shape')).toBe('Diamond');
    expect(describeKnob({ ...DEFAULT_PATTERNS.radiance, shape: 4 }, 'shape')).toBe('Square');
    expect(describeKnob(DEFAULT_PATTERNS.radiance, 'ringWidth')).toBe('8');
    expect(describeKnob(DEFAULT_PATTERNS.chevron, 'wave')).toBe('Chevron');
    expect(describeKnob({ ...DEFAULT_PATTERNS.chevron, wave: 2 }, 'wave')).toBe('Bargello');
    expect(describeKnob(DEFAULT_PATTERNS.chevron, 'period')).toBe('24');
    expect(describeKnob(DEFAULT_PATTERNS.sunburst, 'rays')).toBe('12');
  });
});
describe('palette reads', () => {
  it('lists every enamel of a palette in band order', () => {
    expect(paletteStops(emerald)).toEqual([emerald.colourOne, emerald.colourTwo]);
    expect(paletteStops(peacock)).toEqual([
      peacock.colourOne,
      ...(peacock.accents as readonly string[]),
      peacock.colourTwo,
    ]);
  });

  it('recognises the active palette case-insensitively and rejects near misses', () => {
    expect(isPaletteActive(peacockFan, peacock)).toBe(true);
    expect(isPaletteActive(emeraldSunburst, emerald)).toBe(true);
    const shouted = {
      ...peacockFan,
      colourOne: peacock.colourOne.toUpperCase(),
      colourTwo: peacock.colourTwo.toUpperCase(),
      accents: (peacock.accents as readonly string[]).map((accent) => accent.toUpperCase()),
    };
    expect(isPaletteActive(shouted, peacock)).toBe(true);
    expect(isPaletteActive({ ...peacockFan, colourOne: '#000000' }, peacock)).toBe(false);
    expect(isPaletteActive({ ...peacockFan, colourTwo: '#000000' }, peacock)).toBe(false);
    expect(isPaletteActive({ ...peacockFan, accents: ['#000000'] }, peacock)).toBe(false);
    expect(isPaletteActive({ ...peacockFan, accents: undefined }, peacock)).toBe(false);
  });
});
