import { describe, expect, it } from 'vitest';
import { fitLabel } from './fitLabel';

const mono = (text: string, size: number) => text.length * size * 0.6;

describe('fitLabel', () => {
  it('keeps the base size when the name fits', () => {
    const r = fitLabel('Nick Carraway', 400, 32, 14, mono);
    expect(r.text).toBe('Nick Carraway');
    expect(r.size).toBe(32);
  });

  it('shrinks long names down to the minimum', () => {
    const r = fitLabel('Ewing Klipspringer', 160, 32, 14, mono);
    expect(r.size).toBeLessThan(32);
    expect(mono(r.text, r.size)).toBeLessThanOrEqual(160);
  });

  it('ellipsizes when even the minimum size cannot fit', () => {
    const name = 'Meyer Wolfsheim of the World Series 1919';
    const r = fitLabel(name, 90, 32, 14, mono);
    expect(r.size).toBe(14);
    expect(r.text.endsWith('…')).toBe(true);
    expect(mono(r.text, r.size)).toBeLessThanOrEqual(90);
  });
});