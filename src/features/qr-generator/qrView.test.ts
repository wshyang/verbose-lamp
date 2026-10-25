import { describe, expect, it } from 'vitest';
import { tryEncodeQr } from './encode';
import { QR_PRESETS } from './presets';
import { findMatchingPreset, planOf, summaryOf } from './qrView';

const encode = (text: string) => tryEncodeQr({ text, errorCorrection: 'M' });

describe('findMatchingPreset', () => {
  it.each(QR_PRESETS.map((preset) => [preset.id, preset] as const))('finds %s by its text and level', (id, preset) => {
    expect(findMatchingPreset(preset.text, preset.errorCorrection)).toBe(id);
  });

  it('needs both the text and the level to agree', () => {
    const preset = QR_PRESETS[0];
    const otherLevel = preset.errorCorrection === 'L' ? 'H' : 'L';

    expect(findMatchingPreset(preset.text, otherLevel)).toBeNull();
    expect(findMatchingPreset(`${preset.text} `, preset.errorCorrection)).toBeNull();
  });
});

describe('planOf', () => {
  it('draws an encoded code', () => {
    const plan = planOf(encode('hello'), 'plaque');

    expect(plan).not.toBeNull();
    expect(plan!.size).toBeGreaterThan(0);
  });

  it('draws nothing for text that could not be encoded', () => {
    expect(planOf(encode(''), 'plaque')).toBeNull();
  });

  it('draws different shapes differently from the same code', () => {
    const encoded = encode('hello');

    expect(planOf(encoded, 'dot')).not.toEqual(planOf(encoded, 'plaque'));
  });
});

describe('summaryOf', () => {
  it('has no summary without a plan', () => {
    expect(summaryOf(null, 'anything')).toBeNull();
  });

  it('reports the plan version and size with the text length in bytes', () => {
    const plan = planOf(encode('héllo'), 'plaque')!;

    expect(summaryOf(plan, 'héllo')).toEqual({ version: plan.version, size: plan.size, byteCount: 6 });
  });
});
