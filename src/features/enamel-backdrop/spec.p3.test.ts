// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';

import { BACKDROP_PRESETS, ENAMEL_PALETTES, SPEC_KNOBS } from './palettes';

import { parseHexColour } from './colour';

import { describeKnob, isPaletteActive, paletteStops, patternKnobValue, specKnobValue, withColours, withInlay, withPalette, withPatternKind, withPatternKnob, withSpecKnob } from './spec';

describe('spec edit guards', () => {
  it('keeps the spec when a knob is unknown or the value is not finite', () => {
    const spec = BACKDROP_PRESETS[0].spec;
    expect(withPatternKnob(spec, { key: 'not-a-knob', value: 3 })).toBe(spec);
    expect(withPatternKnob(spec, { key: 'rays', value: Number.NaN })).toBe(spec);
    expect(withSpecKnob(spec, { knob: 'bands', value: Number.NaN })).toBe(spec);
  });

  it('rounds a finish knob to its step and clamps it', () => {
    const spec = BACKDROP_PRESETS[0].spec;
    expect(withSpecKnob(spec, { knob: 'bands', value: 99 }).bands).toBe(SPEC_KNOBS.bands.max);
    expect(withSpecKnob(spec, { knob: 'bands', value: -4 }).bands).toBe(SPEC_KNOBS.bands.min);
  });

  it('ignores colours that are not six-digit hex', () => {
    const spec = BACKDROP_PRESETS[0].spec;
    const edited = withColours(spec, { colourOne: 'red', colourTwo: undefined });
    expect(edited.colourOne).toBe(spec.colourOne);
    expect(edited.colourTwo).toBe(spec.colourTwo);
  });

  it('names the shape and stitch of a patterned knob', () => {
    const radiance = { kind: 'radiance', shape: 2 } as never;
    expect(describeKnob(radiance, 'shape')).toBeTypeOf('string');
    const chevron = { kind: 'chevron', wave: 1 } as never;
    expect(describeKnob(chevron, 'wave')).toBeTypeOf('string');
  });
});
describe('spec edits that are pure lookups', () => {
  it('reads a knob value, defaulting to zero', () => {
    const spec = BACKDROP_PRESETS[0].spec;
    expect(specKnobValue(spec, 'bands')).toBe(spec.bands);
    expect(specKnobValue(spec, 'guilloche')).toBe(spec.guilloche ?? 0);
  });

  it('keeps the spec when the pattern or inlay is already chosen', () => {
    const spec = BACKDROP_PRESETS[0].spec;
    expect(withPatternKind(spec, spec.pattern.kind)).toBe(spec);
    expect(withInlay({ ...spec, inlay: 'cloisonne' }, 'cloisonne')).toBeDefined();
    expect(withInlay({ ...spec, inlay: 'gilded-bands' }, 'gilded-bands')).toEqual({
      ...spec,
      inlay: 'gilded-bands',
    });
  });

  it('applies a palette with and without accents', () => {
    const spec = BACKDROP_PRESETS[0].spec;
    const plain = withPalette(spec, { colourOne: '#111111', colourTwo: '#222222' } as never);
    expect(plain.accents).toEqual([]);
    const jewelled = withPalette(spec, {
      colourOne: '#111111',
      colourTwo: '#222222',
      accents: ['#333333'],
    } as never);
    expect(jewelled.accents).toEqual(['#333333']);
  });

  it('describes a plain knob with its number', () => {
    expect(describeKnob({ kind: 'sunburst', rays: 12 } as never, 'rays')).toBe('12');
  });
});
describe('patternKnobValue guards', () => {
  it('reads zero for a knob that is not a number', () => {
    expect(patternKnobValue({ kind: 'chevron', wave: 'tall' } as never, 'wave')).toBe(0);
    expect(patternKnobValue({ kind: 'chevron', wave: 2 } as never, 'wave')).toBe(2);
  });
});
describe('parseHexColour', () => {
  it('reads six-digit hex and falls back to black', () => {
    expect(parseHexColour('#102030')).toEqual([16, 32, 48]);
    expect(parseHexColour('102030')).toEqual([16, 32, 48]);
    expect(parseHexColour('rebeccapurple')).toEqual([0, 0, 0]);
    expect(parseHexColour('#abc')).toEqual([0, 0, 0]);
  });
});
describe('palette chips', () => {
  it('lists every enamel in band order, accents or not', () => {
    const [peacock] = ENAMEL_PALETTES.slice(5);
    expect(paletteStops(peacock)).toEqual([peacock.colourOne, ...peacock.accents!, peacock.colourTwo]);
    expect(paletteStops({ id: 'plain', name: 'Plain', colourOne: '#111111', colourTwo: '#eeeeee', ground: '#000000' })).toEqual([
      '#111111',
      '#eeeeee',
    ]);
  });

  it('marks the palette whose enamels are on the spec', () => {
    const [peacock] = ENAMEL_PALETTES;
    const spec = BACKDROP_PRESETS[0].spec;
    const active = withPalette(spec, peacock);
    expect(isPaletteActive(active, peacock)).toBe(true);
    expect(isPaletteActive(withColours(active, { colourTwo: '#ffffff' }), peacock)).toBe(false);

    const { accents: _accents, ...specWithoutAccents } = spec;
    const plain = { ...specWithoutAccents, colourOne: '#111111', colourTwo: '#eeeeee' };
    expect(isPaletteActive(plain, { id: 'plain', name: 'Plain', colourOne: '#111111', colourTwo: '#eeeeee', ground: '#000000' })).toBe(
      true,
    );
    expect(isPaletteActive(plain, peacock)).toBe(false);
  });
});
describe('spec edits that keep identity', () => {
  it('returns the same spec when the inlay is already set', () => {
    const spec = BACKDROP_PRESETS[0].spec;
    expect(withInlay(spec, spec.inlay ?? 'cloisonne')).toBe(spec);
    expect(withInlay(spec, spec.inlay === 'gilded-bands' ? 'cloisonne' : 'gilded-bands')).not.toBe(spec);
  });

  it('ignores an invalid second colour but takes a valid one', () => {
    const spec = BACKDROP_PRESETS[0].spec;
    expect(withColours(spec, { colourOne: '#123456', colourTwo: 'mauve' }).colourTwo).toBe(spec.colourTwo);
    expect(withColours(spec, { colourTwo: '#123456' }).colourTwo).toBe('#123456');
  });
});
