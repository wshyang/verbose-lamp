import { describe, expect, it } from 'vitest';
import { encodeQr } from './encode';
import {
  buildModulePath,
  buildModuleShape,
  buildRenderPlan,
  chamferedSquarePath,
  DEFAULT_QR_STYLE,
  isInFinderZone,
  locateFinders,
  resolveQrStyle,
} from './geometry';

const ACT_ONE = encodeQr({ text: 'GATSBY', errorCorrection: 'M' });

function countDarkOutsideFinders(): number {
  let count = 0;
  ACT_ONE.modules.forEach((row, r) =>
    row.forEach((isDark, c) => {
      if (isDark && !isInFinderZone(r, c, ACT_ONE.size)) count++;
    })
  );
  return count;
}

describe('finder location and zoning', () => {
  it('places finders at three corners of a version-1 symbol', () => {
    expect(locateFinders(21)).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 14 },
      { row: 14, col: 0 },
    ]);
  });

  it('reserves the 8×8 corner zones including separators', () => {
    expect(isInFinderZone(0, 0, 21)).toBe(true);
    expect(isInFinderZone(7, 7, 21)).toBe(true);
    expect(isInFinderZone(8, 0, 21)).toBe(false);
    expect(isInFinderZone(0, 13, 21)).toBe(true);
    expect(isInFinderZone(13, 0, 21)).toBe(true);
    expect(isInFinderZone(20, 20, 21)).toBe(false);
  });
});

describe('module shapes', () => {
  it('insets a plaque tile within its cell', () => {
    const style = { ...DEFAULT_QR_STYLE, quietZone: 0, inset: 0.1 };
    expect(buildModuleShape(style, 2, 3)).toBe('M2.1 3.1h0.8v0.8h-0.8z');
  });

  it('rotates a diamond about the cell centre', () => {
    const style = resolveQrStyle('diamond');
    const path = buildModuleShape({ ...style, quietZone: 0, inset: 0 }, 0, 0);
    expect(path).toBe('M0.5 0L1 0.5L0.5 1L0 0.5z');
  });

  it('draws a dot as two arcs spanning the cell', () => {
    const style = resolveQrStyle('dot');
    const path = buildModuleShape({ ...style, quietZone: 0, inset: 0 }, 0, 0);
    expect(path).toBe('M0 0.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0z');
  });

  it('builds a chamfered octagon and clamps the chamfer to half the span', () => {
    const octagon = chamferedSquarePath(0, 0, 7, 1);
    expect(octagon).toBe('M1 0L6 0L7 1L7 6L6 7L1 7L0 6L0 1z');
    expect(chamferedSquarePath(0, 0, 2, 5)).toBe('M1 0L1 0L2 1L2 1L1 2L1 2L0 1L0 1z');
  });
});

describe('render plan', () => {
  it('emits one subpath per dark module outside the finder zones', () => {
    const path = buildModulePath(ACT_ONE, DEFAULT_QR_STYLE);
    const subpaths = path.split('M').length - 1;
    expect(subpaths).toBe(countDarkOutsideFinders());
  });

  it('sizes the viewBox by the quiet zone on every side', () => {
    const plan = buildRenderPlan(ACT_ONE, { ...DEFAULT_QR_STYLE, quietZone: 3 });
    expect(plan.viewBox).toBe(27);
    expect(plan.quietZone).toBe(3);
  });

  it('offsets finder rings and cores by the quiet zone', () => {
    const plan = buildRenderPlan(ACT_ONE);
    expect(plan.finderPaths.ring.startsWith('M5.85 5')).toBe(true);
    expect(plan.finderPaths.core.startsWith('M7.425 7')).toBe(true);
    expect(plan.viewBox).toBe(31);
  });

  it('protects the Act I golden geometry', () => {
    expect(buildRenderPlan(ACT_ONE)).toMatchSnapshot();
  });
});
