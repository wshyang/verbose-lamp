
import { describe, expect, it } from 'vitest';
import { finishForFormula } from './frameMaterial';
import { createChamferedFrameGeometry } from './railGeometry';

describe('frame material', () => {
  it('resolves formula finishes across sources and enabled layers', () => {
    expect(finishForFormula({ source: 'lattice' })).toBe('brass');
    expect(finishForFormula({ source: 'authored', layers: [{ source: 'lattice', enabled: true }] })).toBe('brass');
    expect(finishForFormula({ source: 'authored', layers: [{ source: 'lattice', enabled: false }] })).toBe('gold');
    expect(finishForFormula({ source: 'authored', layers: [{ source: 'none', enabled: true }] })).toBe('gold');
    expect(finishForFormula({ source: 'authored' })).toBe('gold');
  });
});

describe('rail geometry', () => {
  it('builds an empty indexed geometry from no specs', () => {
    const geometry = createChamferedFrameGeometry([]);
    expect(geometry.getAttribute('position').count).toBe(0);
    expect(geometry.getIndex()?.count).toBe(0);
    geometry.dispose();
  });
});
