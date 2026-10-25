// @vitest-environment jsdom
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBallroomEnvironment, createDecoWallpaperTextures } from './environment';

const pmrem = vi.hoisted(() => ({
  texture: { id: 'pmrem-texture' },
  compileEquirectangularShader: vi.fn(),
  fromEquirectangular: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class MockPmrem {
    compileEquirectangularShader = pmrem.compileEquirectangularShader;
    fromEquirectangular = pmrem.fromEquirectangular;
    dispose = pmrem.dispose;
  }
  return { ...actual, PMREMGenerator: MockPmrem };
});

function recordingContext() {
  const gradient = { addColorStop: vi.fn() };
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    createLinearGradient: vi.fn(() => gradient),
    createRadialGradient: vi.fn(() => gradient),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4).fill(128),
    })),
    createImageData: vi.fn((width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
    })),
    putImageData: vi.fn(),
    gradient,
  };
}

function fakeCanvas(ctx: ReturnType<typeof recordingContext>) {
  return { width: 0, height: 0, getContext: vi.fn(() => ctx) };
}

beforeEach(() => {
  pmrem.fromEquirectangular.mockReturnValue({ texture: pmrem.texture });
});

afterEach(() => vi.restoreAllMocks());

describe('procedural premiere environment textures', () => {
  it('paints a ballroom equirectangular canvas and returns the PMREM texture', () => {
    const ctx = recordingContext();
    const canvas = fakeCanvas(ctx);
    vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLElement);
    const texture = createBallroomEnvironment({} as THREE.WebGLRenderer);
    expect(canvas).toMatchObject({ width: 1024, height: 512 });
    expect(canvas.getContext).toHaveBeenCalledWith('2d');
    expect(ctx.createLinearGradient).toHaveBeenCalledTimes(18);
    expect(ctx.createRadialGradient).toHaveBeenCalledTimes(5);
    expect(ctx.gradient.addColorStop).toHaveBeenCalledTimes(97);
    expect(ctx.fillRect).toHaveBeenCalledTimes(18);
    expect(ctx.arc).toHaveBeenCalledTimes(5);
    expect(texture).toBe(pmrem.texture);
    expect(pmrem.compileEquirectangularShader).toHaveBeenCalledOnce();
    expect(pmrem.fromEquirectangular).toHaveBeenCalledWith(expect.any(THREE.CanvasTexture));
    expect(pmrem.dispose).toHaveBeenCalledOnce();
  });

  it('derives seamless albedo, Sobel normal, and roughness wallpaper maps', () => {
    const contexts = [recordingContext(), recordingContext(), recordingContext()];
    const canvases = contexts.map(fakeCanvas);
    const createElement = vi.spyOn(document, 'createElement');
    canvases.forEach((canvas) => {
      createElement.mockReturnValueOnce(canvas as unknown as HTMLElement);
    });
    const textures = createDecoWallpaperTextures();
    expect(textures.map).toBeInstanceOf(THREE.CanvasTexture);
    expect(textures.normalMap).toBeInstanceOf(THREE.DataTexture);
    expect(textures.roughnessMap).toBeInstanceOf(THREE.CanvasTexture);
    expect(textures.map.repeat.toArray()).toEqual([7, 4]);
    expect(textures.normalMap.repeat.toArray()).toEqual([7, 4]);
    expect(textures.map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(contexts[0].save).toHaveBeenCalledTimes(49);
    expect(contexts[0].getImageData).toHaveBeenCalledWith(0, 0, 512, 512);
    expect(contexts[1].putImageData).toHaveBeenCalledOnce();
    expect(contexts[2].putImageData).toHaveBeenCalledOnce();
    expect(Array.from((textures.normalMap.image.data as Uint8Array).slice(0, 4))).toEqual([128, 128, 255, 255]);
  });
});
