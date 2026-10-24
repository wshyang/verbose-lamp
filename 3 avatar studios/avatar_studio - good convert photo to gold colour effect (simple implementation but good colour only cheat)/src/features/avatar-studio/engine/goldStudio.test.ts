import { describe, expect, it } from 'vitest';
import { bandGoldShare, edgeDistance, renderGoldStudio, sheenAt } from './goldStudio';
import { DEFAULT_PATTERNS } from './backdropArt';
import { gridFromSprite } from './portraitGrid';
import type { GoldStudioOptions, PortraitGrid } from '../types';

function options(overrides: Partial<GoldStudioOptions> = {}): GoldStudioOptions {
  return {
    pattern: DEFAULT_PATTERNS.rays,
    artColours: ['#1f5f8b', '#d96f32', '#f2e3c4'],
    rampId: 'bright',
    goldShare: 0.6,
    sheen: 0.4,
    gildSubject: true,
    rim: true,
    shimmerPhase: 0,
    ...overrides,
  };
}

function gridOf(size: number, background: (x: number, y: number) => boolean): PortraitGrid {
  const colours = new Uint8Array(size * size * 3);
  const backgroundCells = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const at = y * size + x;
      colours[at * 3] = 120;
      colours[at * 3 + 1] = 90;
      colours[at * 3 + 2] = 70;
      backgroundCells[at] = background(x, y) ? 1 : 0;
    }
  }
  return { size, background: backgroundCells, colours };
}

describe('the gold plate', () => {
  it('is the size of the portrait it was given', () => {
    const plate = renderGoldStudio(gridOf(16, () => false), options());
    expect(plate.width).toBe(16);
    expect(plate.height).toBe(16);
    expect(plate.data.length).toBe(16 * 16 * 4);
  });

  it('gives every cell an opaque pixel', () => {
    const plate = renderGoldStudio(gridOf(16, () => true), options());
    for (let at = 3; at < plate.data.length; at += 4) {
      expect(plate.data[at]).toBe(255);
    }
  });

  it('lays gold on the rim', () => {
    const grid = gridOf(32, () => true);
    const plate = renderGoldStudio(grid, options({ rim: true }));
    const corner = plate.data[0] ?? 0;
    const middle = plate.data[(16 * 32 + 16) * 4] ?? 0;
    expect(corner).not.toBe(middle);
  });

  it('paints the sitter differently from the ground', () => {
    const grid = gridOf(32, (x) => x < 16);
    const plate = renderGoldStudio(grid, options({ rim: false, sheen: 0 }));
    const sitter = plate.data[(16 * 32 + 24) * 4] ?? 0;
    const ground = plate.data[(16 * 32 + 4) * 4] ?? 0;
    expect(sitter).not.toBe(ground);
  });

  it('keeps the sitter in their own colours when the house is not gilding them', () => {
    const grid = gridOf(32, (x) => x < 16);
    const gilt = renderGoldStudio(grid, options({ rim: false, sheen: 0, gildSubject: true }));
    const plain = renderGoldStudio(grid, options({ rim: false, sheen: 0, gildSubject: false }));
    expect(gilt.data[(16 * 32 + 24) * 4]).not.toBe(plain.data[(16 * 32 + 24) * 4]);
    expect(plain.data[(16 * 32 + 24) * 4]).toBe(120);
  });

  it('is the same picture every time it is drawn', () => {
    const grid = gridOf(24, (x) => x > 12);
    const first = renderGoldStudio(grid, options());
    const second = renderGoldStudio(grid, options());
    expect(Array.from(first.data)).toEqual(Array.from(second.data));
  });
});

describe('the pieces of the plate', () => {
  it('alternates inlaid and gilded bands', () => {
    expect(bandGoldShare(0)).toBeLessThan(bandGoldShare(1));
    expect(bandGoldShare(2)).toBe(bandGoldShare(0));
  });

  it('measures the distance to the edge of the plate', () => {
    expect(edgeDistance(0, 0, 10)).toBe(0);
    expect(edgeDistance(4, 5, 10)).toBe(4);
  });

  it('puts the specular sweep on a diagonal', () => {
    expect(sheenAt(0, 0, 64, 0)).toBeCloseTo(sheenAt(10, 10, 64, 0), 6);
    expect(sheenAt(0, 0, 64, 0)).not.toBeCloseTo(sheenAt(40, 0, 64, 0), 6);
  });
});

describe('a sprite read back as a portrait', () => {
  it('keeps the ink contour with the sitter and the ground behind them', () => {
    const sprite = {
      size: 4,
      palette: ['#ff0000', '#00ff00', '#0000ff', '#111111'],
      rows: ['0123', '0123', '0123', '0123'],
    };
    const grid = gridFromSprite(sprite);
    expect(grid.size).toBe(4);
    // The palette is [photo colours…, backdrop, ink], so the third entry is the ground.
    expect(grid.background[2]).toBe(1);
    expect(grid.background[0]).toBe(0);
    expect(grid.background[1]).toBe(0);
    expect(grid.background[3]).toBe(0);
  });
});
