import { describe, expect, it } from 'vitest';
import { parseHexColour } from './colour';
import { DEFAULT_BACKDROPS } from './palettes';
import { fieldAt } from './patterns';
import { renderEnamelPanel } from './renderBackdrop';
import { describeKnob, patternKnobValue, withInlay, withSpecKnob } from './spec';
import type { BackdropPattern } from './types';

const SPEC = DEFAULT_BACKDROPS[0].spec;

describe('enamel pure branches', () => {
  it('returns black for invalid hex and throws for an unhandled pattern', () => {
    expect(parseHexColour('gold')).toEqual([0, 0, 0]);
    expect(() => fieldAt({ x: 0, y: 0 }, { size: 10, bands: 2 }, { kind: 'mystery' } as never))
      .toThrow('Unhandled backdrop pattern');
  });

  it('guards non-finite spec knobs and reads missing pattern/inlay values', () => {
    expect(withSpecKnob(SPEC, { knob: 'gilt', value: Number.NaN })).toBe(SPEC);
    expect(patternKnobValue(SPEC.pattern, 'missing')).toBe(0);
    const { inlay: _inlay, ...withoutInlay } = SPEC;
    expect(withInlay(withoutInlay, 'cloisonne')).toBe(withoutInlay);
    expect(withInlay(withoutInlay, 'gilded-bands').inlay).toBe('gilded-bands');
  });

  it('names radiance shapes and chevron waves', () => {
    const radiance = { kind: 'radiance', shape: 2, ringWidth: 6, lobes: 8, lobeDepth: 1 } as BackdropPattern;
    const chevron = { kind: 'chevron', wave: 2 } as unknown as BackdropPattern;
    expect(describeKnob(radiance, 'shape')).not.toBe('2');
    expect(describeKnob(chevron, 'wave')).not.toBe('2');
  });

  it('renders one-band and one-pixel panels', () => {
    const oneBand = renderEnamelPanel({ ...SPEC, bands: 1 }, 8);
    expect(oneBand.image.data.length).toBe(256);
    const onePixel = renderEnamelPanel(SPEC, 1);
    expect(onePixel.image.data.length).toBe(4);
  });
});
