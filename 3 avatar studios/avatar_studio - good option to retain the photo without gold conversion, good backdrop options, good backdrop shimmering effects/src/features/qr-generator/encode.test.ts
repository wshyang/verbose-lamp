import { describe, expect, it } from 'vitest';
import {
  encodeQr,
  QR_EMPTY_MESSAGE,
  QR_OVERFLOW_MESSAGE,
  toUtf8ByteString,
  tryEncodeQr,
  versionFromSize,
} from './encode';

const GALA_LINK = 'https://github.com/wshyang/verbose-lamp';

describe('UTF-8 byte expansion', () => {
  it('leaves ASCII untouched', () => {
    expect(toUtf8ByteString('GATSBY')).toBe('GATSBY');
  });

  it('expands multi-byte glyphs into one character per byte', () => {
    const expanded = toUtf8ByteString('Daisy ✦');
    expect(expanded.length).toBe(9);
    expect(expanded.charCodeAt(6)).toBe(0xe2);
  });
});

describe('encodeQr', () => {
  it('produces a version-1 symbol for a short Act title', () => {
    const matrix = encodeQr({ text: 'GATSBY', errorCorrection: 'M' });
    expect(matrix.size).toBe(21);
    expect(matrix.version).toBe(1);
    expect(matrix.modules).toHaveLength(21);
  });

  it('places the three finder patterns with their light separators', () => {
    const { modules, size } = encodeQr({ text: 'GATSBY', errorCorrection: 'M' });
    expect(modules[0][0]).toBe(true);
    expect(modules[0][size - 1]).toBe(true);
    expect(modules[size - 1][0]).toBe(true);
    expect(modules[0][7]).toBe(false);
    expect(modules[7][0]).toBe(false);
    expect(modules[3][3]).toBe(true);
  });

  it('grows the symbol when stronger correction is requested', () => {
    const light = encodeQr({ text: GALA_LINK, errorCorrection: 'L' });
    const heavy = encodeQr({ text: GALA_LINK, errorCorrection: 'H' });
    expect(heavy.version).toBeGreaterThan(light.version);
  });

  it('returns frozen rows so render layers cannot mutate the symbol', () => {
    const matrix = encodeQr({ text: 'West Egg', errorCorrection: 'Q' });
    expect(Object.isFrozen(matrix)).toBe(true);
    expect(Object.isFrozen(matrix.modules)).toBe(true);
    expect(Object.isFrozen(matrix.modules[0])).toBe(true);
  });

  it('derives version from module count', () => {
    expect(versionFromSize(21)).toBe(1);
    expect(versionFromSize(177)).toBe(40);
  });
});

describe('tryEncodeQr', () => {
  it('rejects blank input with user-facing copy', () => {
    const result = tryEncodeQr({ text: '   ', errorCorrection: 'M' });
    expect(result).toEqual({ ok: false, reason: QR_EMPTY_MESSAGE });
  });

  it('rejects text beyond the module cap without throwing', () => {
    const result = tryEncodeQr({ text: 'G'.repeat(1300), errorCorrection: 'L' });
    expect(result).toEqual({ ok: false, reason: QR_OVERFLOW_MESSAGE });
  });

  it('rejects multi-byte text that overflows capacity while under the character cap', () => {
    const result = tryEncodeQr({ text: '✦'.repeat(1000), errorCorrection: 'H' });
    expect(result).toEqual({ ok: false, reason: QR_OVERFLOW_MESSAGE });
  });

  it('encodes a realistic invitation link', () => {
    const result = tryEncodeQr({ text: GALA_LINK, errorCorrection: 'Q' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.matrix.version).toBeGreaterThanOrEqual(3);
  });
});
