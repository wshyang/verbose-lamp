import { describe, expect, it } from 'vitest';
import { fitLabel } from './fitLabel';

const mono = (text: string, size: number) => text.length * size * 0.6;

describe('fitLabel', () => {
  it('keeps the base size when the name fits', () => {
    const r = fitLabel({ text: 'Nick Carraway', maxWidth: 400, baseSize: 32, minSize: 14, measure: mono });
    expect(r.text).toBe('Nick Carraway');
    expect(r.size).toBe(32);
  });

  it('shrinks long names down to the minimum', () => {
    const r = fitLabel({ text: 'Ewing Klipspringer', maxWidth: 160, baseSize: 32, minSize: 14, measure: mono });
    expect(r.size).toBeLessThan(32);
    expect(mono(r.text, r.size)).toBeLessThanOrEqual(160);
  });

  it('ellipsizes when even the minimum size cannot fit', () => {
    const name = 'Meyer Wolfsheim of the World Series 1919';
    const r = fitLabel({ text: name, maxWidth: 90, baseSize: 32, minSize: 14, measure: mono });
    expect(r.size).toBe(14);
    expect(r.text.endsWith('…')).toBe(true);
    expect(mono(r.text, r.size)).toBeLessThanOrEqual(90);
  });
});