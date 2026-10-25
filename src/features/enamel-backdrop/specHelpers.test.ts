import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BACKDROPS,
  DEFAULT_PATTERNS,
  ENAMEL_PALETTES,
  describeKnob,
  isPaletteActive,
  paletteStops,
  patternKnobValue,
  specKnobValue,
  withInlay,
  withPalette,
  withPatternKnob,
  withPatternKind,
  withSpecKnob,
} from './index';

const SUNBURST = DEFAULT_PATTERNS.sunburst;
const SPEC = DEFAULT_BACKDROPS[0].spec;

describe('knob readers', () => {
  it('read a numeric pattern knob and treat everything else as zero', () => {
    expect(patternKnobValue(SUNBURST, 'rays')).toBe(SUNBURST.rays);
    expect(patternKnobValue(SUNBURST, 'kind')).toBe(0);
    expect(patternKnobValue(SUNBURST, 'missing')).toBe(0);
  });

  it('read an optional finish knob as zero until it is set', () => {
    expect(specKnobValue(SPEC, 'bands')).toBe(SPEC.bands);
    expect(specKnobValue({ ...SPEC, guilloche: undefined }, 'guilloche')).toBe(0);
    expect(specKnobValue(withSpecKnob(SPEC, { knob: 'guilloche', value: 0.4 }), 'guilloche')).toBe(0.4);
  });

  it('name the radiance shapes and chevron waves, and print other values', () => {
    const radiance = DEFAULT_PATTERNS.radiance;
    expect(describeKnob(radiance, 'shape')).toBe('Circle');
    expect(describeKnob({ ...radiance, shape: 1 }, 'shape')).toBe('Diamond');
    expect(describeKnob({ ...radiance, shape: 3 }, 'shape')).toBe('Squircle');
    // Out-of-range values clamp to the named table rather than throwing.
    expect(describeKnob({ ...radiance, shape: 99 }, 'shape')).toBe('Square');

    const chevron = DEFAULT_PATTERNS.chevron;
    expect(describeKnob(chevron, 'wave')).toBe('Chevron');
    expect(describeKnob({ ...chevron, wave: 2 }, 'wave')).toBe('Bargello');
    expect(describeKnob(chevron, 'period')).toBe(String(chevron.period));
  });
});

describe('palettes', () => {
  it('lists every enamel in band order', () => {
    const [first] = ENAMEL_PALETTES;
    expect(paletteStops(first)[0]).toBe(first.colourOne);
    expect(paletteStops(first).at(-1)).toBe(first.colourTwo);
    expect(paletteStops({ ...first, accents: ['#123456'] })).toContain('#123456');
  });

  it('recognises the active palette by its enamels, ignoring case', () => {
    const [first] = ENAMEL_PALETTES;
    const applied = withPalette(SPEC, first);
    expect(isPaletteActive(applied, first)).toBe(true);
    expect(isPaletteActive(applied, ENAMEL_PALETTES[1])).toBe(false);
    expect(isPaletteActive(applied, { ...first, colourOne: first.colourOne.toUpperCase() })).toBe(true);
  });
});

describe('spec edits', () => {
  it('keeps the same spec when nothing would change', () => {
    const inlay = withInlay(SPEC, 'cloisonne');
    expect(withInlay(inlay, 'cloisonne')).toBe(inlay);
    expect(withInlay(SPEC, 'gilded-bands').inlay).toBe('gilded-bands');
    expect(withPatternKind(SPEC, SPEC.pattern.kind)).toBe(SPEC);
  });

  it('ignores unknown knobs and non-finite values', () => {
    expect(withPatternKnob(SPEC, { key: 'nope', value: 3 })).toBe(SPEC);
    expect(withPatternKnob(SPEC, { key: 'rays', value: Number.NaN })).toBe(SPEC);
    expect(withSpecKnob(SPEC, { knob: 'bands', value: Number.POSITIVE_INFINITY })).toBe(SPEC);
  });

  it('rejects malformed hex colours but accepts valid ones', () => {
    const kept = withPalette(SPEC, ENAMEL_PALETTES[0]);
    const edited = withPalette(kept, { ...ENAMEL_PALETTES[0] });
    expect(edited.colourOne).toBe(ENAMEL_PALETTES[0].colourOne);
  });
});
