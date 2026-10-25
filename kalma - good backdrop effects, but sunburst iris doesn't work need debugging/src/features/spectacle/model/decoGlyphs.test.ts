import { describe, expect, it } from 'vitest';
import { canRenderInDecoGlyphs } from './decoGlyphs';

describe('canRenderInDecoGlyphs', () => {
  it('accepts the Deco alphabet after upper-casing', () => {
    expect(canRenderInDecoGlyphs('Jay Gatsby')).toBe(true);
    expect(canRenderInDecoGlyphs('WEST EGG 1925 & CO.')).toBe(true);
    expect(canRenderInDecoGlyphs('nick · carraway')).toBe(true);
  });

  it('rejects apostrophes and non-Latin glyphs', () => {
    expect(canRenderInDecoGlyphs("O'Brien")).toBe(false);
    expect(canRenderInDecoGlyphs('Müller')).toBe(false);
    expect(canRenderInDecoGlyphs('佐藤')).toBe(false);
    expect(canRenderInDecoGlyphs('   ')).toBe(false);
  });
});