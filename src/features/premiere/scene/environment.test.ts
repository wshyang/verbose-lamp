// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const pmrem = vi.hoisted(() => ({
  compiled: 0,
  converted: 0,
  disposed: 0,
  texture: { isTexture: true, dispose: vi.fn() },
}));

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class FakePMREMGenerator {
    compileEquirectangularShader() {
      pmrem.compiled += 1;
    }
    fromEquirectangular() {
      pmrem.converted += 1;
      return { texture: pmrem.texture };
    }
    dispose() {
      pmrem.disposed += 1;
    }
  }
  return { ...actual, PMREMGenerator: FakePMREMGenerator };
});

import { createBallroomEnvironment, createDecoWallpaperTextures } from './environment';

describe('ballroom environment', () => {
  it('bakes the equirectangular softbox map to a PMREM texture and frees the intermediate', () => {
    const renderer = {} as THREE.WebGLRenderer;
    const texture = createBallroomEnvironment(renderer);

    expect(texture).toBe(pmrem.texture);
    expect(pmrem.compiled).toBe(1);
    expect(pmrem.converted).toBe(1);
    expect(pmrem.disposed).toBe(1);
  });
});

describe('deco wallpaper textures', () => {
  it('builds a tiling albedo, normal and roughness set', () => {
    const textures = createDecoWallpaperTextures();

    expect(textures.map).toBeInstanceOf(THREE.CanvasTexture);
    expect(textures.roughnessMap).toBeInstanceOf(THREE.CanvasTexture);
    expect(textures.normalMap).toBeInstanceOf(THREE.DataTexture);
    expect(textures.normalMap.image.width).toBe(512);
    expect(textures.normalMap.image.height).toBe(512);
    expect(textures.map.wrapS).toBe(THREE.RepeatWrapping);
    expect(textures.map.repeat.x).toBeGreaterThan(1);

    textures.map.dispose();
    textures.normalMap.dispose();
    textures.roughnessMap.dispose();
  });

  it('derives normals that point mostly out of the surface', () => {
    const { normalMap } = createDecoWallpaperTextures();
    const data = normalMap.image.data as Uint8Array;
    let outward = 0;
    const samples = Math.floor(data.length / 4 / 97);
    for (let i = 0; i < samples; i += 1) {
      const blue = data[i * 4 * 97 + 2];
      if (blue >= 128) outward += 1;
    }
    expect(outward / samples).toBeGreaterThan(0.5);
    normalMap.dispose();
  });
});
