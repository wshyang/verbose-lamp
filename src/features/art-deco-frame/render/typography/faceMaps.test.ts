// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { installCanvas2d, type Canvas2d } from '@/test/canvas2d';
import { buildFaceMaps } from './faceMaps';
import type { MaskSurface } from './mask';

/**
 * The albedo ramps and the normal map, on heights chosen by hand. The structural suites around the
 * whole rig only ever see a flat or fully saturated heightfield (jsdom's canvas gives them nothing
 * in between), so the crest tints and the slope of the normals were untested; every change to them
 * left those suites green. The figures here were computed by hand from the ramps and cross-checked
 * against the unsplit function's output on the same input.
 */
let canvas: Canvas2d;
beforeEach(() => {
  canvas = installCanvas2d();
});

function surface(width: number, height: number, alpha = 255): MaskSurface {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data[i * 4 + 3] = alpha;
  return { data, width, height };
}

const flatHeights = (n: number, value: number) => new Float32Array(n).fill(value);
const pixel = (index: number) => {
  const written = canvas.images[canvas.images.length - 1].data as Uint8ClampedArray;
  return Array.from(written.slice(index * 4, index * 4 + 4));
};
const normalAt = (maps: ReturnType<typeof buildFaceMaps>, index: number) => {
  const bytes = maps.normalTex.image.data as unknown as Uint8Array;
  return Array.from(bytes.slice(index * 4, index * 4 + 4));
};

describe('pure gold albedo', () => {
  it.each([
    [0, [215, 166, 58]],
    [0.5, [235, 195, 97]],
    [1, [255, 224, 136]],
  ])('ramps the crest at height %f to %j', (height, rgb) => {
    buildFaceMaps({ mask: surface(2, 2), heights: flatHeights(4, height), finish: 'pure-gold' });

    expect(pixel(0).slice(0, 3)).toEqual(rgb);
  });

  it('clamps a height outside 0 to 1', () => {
    buildFaceMaps({ mask: surface(2, 2), heights: flatHeights(4, 3), finish: 'pure-gold' });
    expect(pixel(0).slice(0, 3)).toEqual([255, 224, 136]);

    buildFaceMaps({ mask: surface(2, 2), heights: flatHeights(4, -2), finish: 'pure-gold' });
    expect(pixel(0).slice(0, 3)).toEqual([215, 166, 58]);
  });
});

describe('platinum-and-gold albedo', () => {
  it.each([
    [0, [238, 196, 108]],
    [0.22, [238, 196, 108]],
    [0.495, [243, 221, 179]],
    [0.77, [247, 246, 249]],
    [1, [247, 246, 249]],
  ])('tints the face at height %f to %j', (height, rgb) => {
    buildFaceMaps({ mask: surface(2, 2), heights: flatHeights(4, height), finish: 'platinum-gold' });

    expect(pixel(0).slice(0, 3)).toEqual(rgb);
  });

  // `buildFaceMaps` has no default of its own: an undefined finish takes the non-platinum branch.
  // The rig's default of platinum-gold lives in createExtrudedDecoTextMesh and is tested there.
  it('treats a missing finish as plain gold, not platinum', () => {
    buildFaceMaps({ mask: surface(2, 2), heights: flatHeights(4, 1), finish: undefined });

    expect(pixel(0).slice(0, 3)).toEqual([255, 224, 136]);
  });
});

describe('albedo alpha', () => {
  it('carries the mask alpha through unchanged, whatever the finish', () => {
    for (const finish of ['pure-gold', 'platinum-gold'] as const) {
      buildFaceMaps({ mask: surface(2, 2, 77), heights: flatHeights(4, 0.5), finish });
      expect(pixel(3)[3]).toBe(77);
    }
  });
});

describe('normal map', () => {
  it('points straight out of a flat heightfield, fully opaque', () => {
    const maps = buildFaceMaps({ mask: surface(4, 4), heights: flatHeights(16, 0.6), finish: 'pure-gold' });

    expect(normalAt(maps, 5)).toEqual([128, 128, 255, 255]);
  });

  it('tilts away from a rising slope along x and along y', () => {
    // Height rises left to right: dx > 0, so the x component of the normal falls below centre.
    const ramp = new Float32Array(25);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) ramp[y * 5 + x] = x / 4;
    const alongX = buildFaceMaps({ mask: surface(5, 5), heights: ramp, finish: 'pure-gold' });
    expect(normalAt(alongX, 12)[0]).toBeLessThan(128);
    expect(normalAt(alongX, 12)[1]).toBe(128);

    // Height rises top to bottom: dy > 0, so the y component rises above centre.
    const down = new Float32Array(25);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) down[y * 5 + x] = y / 4;
    const alongY = buildFaceMaps({ mask: surface(5, 5), heights: down, finish: 'pure-gold' });
    expect(normalAt(alongY, 12)[0]).toBe(128);
    expect(normalAt(alongY, 12)[1]).toBeGreaterThan(128);
  });

  it('gives a known slope its exact encoded normal', () => {
    // At the centre pixel the neighbours are the left (0) and right (1) columns, so
    // dx = (1 - 0) * 3.8 = 3.8, dy = 0, and n = (-3.8, 0, 1) / |n|.
    const ramp = new Float32Array(9);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) ramp[y * 3 + x] = x / 2;
    const maps = buildFaceMaps({ mask: surface(3, 3), heights: ramp, finish: 'pure-gold' });
    const inv = 1 / Math.hypot(3.8, 1);

    expect(normalAt(maps, 4)).toEqual([
      Math.round((-3.8 * inv * 0.5 + 0.5) * 255),
      128,
      Math.round((inv * 0.5 + 0.5) * 255),
      255,
    ]);
    expect(normalAt(maps, 4)).toEqual([4, 128, 160, 255]);
  });

  it('clamps the neighbour lookup at the image edge instead of reading outside it', () => {
    const ramp = new Float32Array(9);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) ramp[y * 3 + x] = x / 2;
    const maps = buildFaceMaps({ mask: surface(3, 3), heights: ramp, finish: 'pure-gold' });

    // The corner sees one real neighbour and itself (dx = 0.5 * 3.8), half the interior's slope.
    const corner = normalAt(maps, 0);
    expect(corner[0]).toBeLessThan(128);
    expect(corner[0]).toBeGreaterThan(normalAt(maps, 4)[0]);
    expect(corner.every((value) => Number.isFinite(value))).toBe(true);
  });
});

describe('textures', () => {
  it('sizes both textures to the mask and tags them for the renderer', () => {
    const maps = buildFaceMaps({ mask: surface(6, 4), heights: flatHeights(24, 0.5), finish: 'pure-gold' });

    expect([maps.normalTex.image.width, maps.normalTex.image.height]).toEqual([6, 4]);
    expect([(maps.colorTex.image as HTMLCanvasElement).width, (maps.colorTex.image as HTMLCanvasElement).height]).toEqual([6, 4]);
    expect(maps.colorTex.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(maps.colorTex.anisotropy).toBe(8);
    expect(maps.normalTex.flipY).toBe(true);
  });
});
