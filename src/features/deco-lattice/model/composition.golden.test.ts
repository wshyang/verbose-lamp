import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildDecoLattice, type DecoLatticeRequest } from './composition';
import { specsToLayerPaths } from './latticeSvg';
import { LATTICE_PRESETS } from './presets';

const FRAME_WIDE: DecoLatticeRequest = { mode: 'frame', hw: 1.6, hh: 1, level: 3, seed: 1925 };
const MEDALLION_DEFAULT: DecoLatticeRequest = { mode: 'medallion', hw: 1, hh: 1 };

function digestRequest(request: DecoLatticeRequest): { specs: number; paths: number; hash: string } {
  const geometry = buildDecoLattice(request);
  const paths = specsToLayerPaths(geometry.specs);
  return {
    specs: geometry.specs.length,
    paths: paths.length,
    hash: createHash('sha1').update(JSON.stringify(paths)).digest('hex'),
  };
}

describe('buildDecoLattice golden snapshots', () => {
  it('default medallion keeps its geometry', () => {
    expect(digestRequest(MEDALLION_DEFAULT)).toMatchSnapshot();
  });

  it('lucky-draw frame keeps its geometry', () => {
    expect(digestRequest(FRAME_WIDE)).toMatchSnapshot();
  });

  for (const preset of LATTICE_PRESETS) {
    it(`${preset.id} preset keeps its geometry`, () => {
      expect(digestRequest(preset.request)).toMatchSnapshot();
    });
  }

  for (const level of [1, 2, 3, 4]) {
    it(`medallion level ${level} keeps its geometry`, () => {
      expect(digestRequest({ ...MEDALLION_DEFAULT, level, seed: 1925 })).toMatchSnapshot();
    });
  }
});
