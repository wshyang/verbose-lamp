// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import * as THREE from 'three';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createBallroomEnvironment, createDecoWallpaperTextures } from './environment';

import { setupDomTests } from '../../../test/dom';

import { installCanvas2d, type Canvas2d } from '../../../test/canvas2d';

/**
 * `createBallroomEnvironment` funnels its canvas through `PMREMGenerator`, which
 * needs a live WebGL context. jsdom has none, so the generator is the single
 * mocked seam: everything upstream (gradients, strips, glows) still runs for
 * real against the recording 2D context.
 */
const pmrem_p6 = vi.hoisted(() => ({
  instances: [] as Array<{ renderer: unknown; compiled: number; disposed: number; sources: unknown[] }>,
}));
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class FakePMREMGenerator {
    private record = { renderer: null as unknown, compiled: 0, disposed: 0, sources: [] as unknown[] };
    constructor(renderer: unknown) {
      this.record.renderer = renderer;
      pmrem_p6.instances.push(this.record);
    }

    compileEquirectangularShader() {
      this.record.compiled += 1;
    }

    fromEquirectangular(texture: unknown) {
      this.record.sources.push(texture);
      return { texture: { isTexture: true, kind: 'pmrem' } };
    }

    dispose() {
      this.record.disposed += 1;
    }
  }
  return { ...actual, PMREMGenerator: FakePMREMGenerator };
});
setupDomTests();
let canvas: Canvas2d;
beforeEach(() => {
  vi.clearAllMocks();
  pmrem_p6.instances.length = 0;
  canvas = installCanvas2d();
});
describe('createBallroomEnvironment', () => {
  it('renders a 1024x512 equirectangular strip panorama', () => {
    createBallroomEnvironment({} as THREE.WebGLRenderer);

    expect(canvas.calls).toContain('createLinearGradient(0,0,0,512)');
    expect(canvas.calls).toContain('fillRect(0,0,1024,512)');
    expect(canvas.calls).toContain('fillRect(0,240.64,1024,30.72)');
  });

  it('draws sixteen alternating studio strips so metal catches hard glints', () => {
    createBallroomEnvironment({} as THREE.WebGLRenderer);

    const strips = canvas.calls.filter((call) => call.startsWith('fillRect(') && call !== 'fillRect(0,0,1024,512)');
    // One gradient band per strip plus the horizon ribbon.
    expect(strips.length).toBeGreaterThanOrEqual(17);
    expect(canvas.calls.filter((call) => call.startsWith('createLinearGradient(')).length).toBeGreaterThanOrEqual(17);
  });

  it('blooms a warm chandelier highlight with a radial gradient', () => {
    createBallroomEnvironment({} as THREE.WebGLRenderer);

    expect(canvas.calls).toContain('createRadialGradient(512,81.92,4,512,81.92,95)');
    expect(canvas.calls).toContain('arc(512,81.92,95,0,6.283)');
    expect(canvas.calls).toContainEqual(expect.stringMatching(/\.addColorStop\(0,rgba\(255, 252, 240, 1\.0\)\)$/));
    expect(canvas.calls).toContainEqual(expect.stringMatching(/\.addColorStop\(1,rgba\(0, 0, 0, 0\.0\)\)$/));
  });

  it('prefilters through PMREM and disposes the intermediate resources', () => {
    const renderer = { name: 'renderer' } as unknown as THREE.WebGLRenderer;
    const texture = createBallroomEnvironment(renderer);

    expect(texture).toEqual({ isTexture: true, kind: 'pmrem' });
    expect(pmrem_p6.instances).toHaveLength(1);

    const [record] = pmrem_p6.instances;
    expect(record.renderer).toBe(renderer);
    expect(record.compiled).toBe(1);
    expect(record.disposed).toBe(1);

    const source = record.sources[0] as THREE.CanvasTexture;
    expect(source).toBeInstanceOf(THREE.CanvasTexture);
    expect(source.mapping).toBe(THREE.EquirectangularReflectionMapping);
    expect(source.colorSpace).toBe(THREE.SRGBColorSpace);
    // Disposed after prefiltering, so no stray GPU allocation survives.
    expect(source.version).toBeGreaterThan(0);
  });
});
describe('createDecoWallpaperTextures', () => {
  it('returns a matched albedo / normal / roughness trio at 7x4 tiling', () => {
    const textures = createDecoWallpaperTextures();

    for (const texture of Object.values(textures)) {
      expect(texture.wrapS).toBe(THREE.RepeatWrapping);
      expect(texture.wrapT).toBe(THREE.RepeatWrapping);
      expect(texture.repeat.x).toBe(7);
      expect(texture.repeat.y).toBe(4);
    }
    expect(textures.map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(textures.map.image.width).toBe(512);
    expect(textures.normalMap.image.width).toBe(512);
    expect(textures.roughnessMap.image.width).toBe(512);
  });

  it('tiles fan cells beyond the frame so the repeat has no seam', () => {
    createDecoWallpaperTextures();

    // 6 columns x 6 rows of cells, each with 9 ribs plus 4 concentric rings.
    expect(canvas.calls.filter((call) => call === 'beginPath()').length).toBeGreaterThan(300);
    expect(canvas.calls.filter((call) => call.startsWith('arc(')).length).toBeGreaterThan(200);
    expect(canvas.calls).toContain('getImageData(512x512)');
  });

  it('derives a flat +Z normal map from a uniform heightfield', () => {
    const { normalMap } = createDecoWallpaperTextures();
    const data = normalMap.image.data as unknown as Uint8Array;

    expect(data).toHaveLength(512 * 512 * 4);
    // Stub pixels are black, so the Sobel gradient vanishes everywhere.
    expect(data[0]).toBe(128);
    expect(data[1]).toBe(128);
    expect(data[2]).toBe(255);
    expect(data[3]).toBe(255);
    for (let i = 4; i < 512 * 4; i += 4) {
      expect(data[i + 2]).toBe(255);
    }
  });

  it('bakes obsidian albedo and velvet roughness for unlit ridges', () => {
    createDecoWallpaperTextures();

    expect(canvas.images).toHaveLength(2);
    const [albedo, roughness] = canvas.images;

    // Deep obsidian #08070c with the bronze ridge contribution at zero.
    expect([albedo.data[0], albedo.data[1], albedo.data[2], albedo.data[3]]).toEqual([8, 7, 12, 255]);
    // 0.88 roughness * 255, clamped by Math.round.
    expect([roughness.data[0], roughness.data[1], roughness.data[2], roughness.data[3]]).toEqual([224, 224, 224, 255]);

    const albedoPixels = new Set<number>();
    for (let i = 3; i < albedo.data.length; i += 4 * 97) albedoPixels.add(albedo.data[i]);
    expect([...albedoPixels]).toEqual([255]);
  });

  it('uploads both canvas textures', () => {
    createDecoWallpaperTextures();

    expect(canvas.calls.filter((call) => call.startsWith('putImageData(')).length).toBe(2);
  });
});
