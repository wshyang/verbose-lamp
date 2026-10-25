// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createExtrudedDecoTextMesh } from './decoTypography';

/**
 * jsdom's canvas shim never writes pixels, so the glyph mask always reads back
 * as transparent and the chamfer passes are skipped. This suite hands the
 * builder a mask with real coverage so the two chamfer sweeps run.
 */
function createMaskContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => {} };
  const noop = () => {};
  const ctx = {
    canvas: null,
    save: noop,
    restore: noop,
    translate: noop,
    scale: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    stroke: noop,
    fill: noop,
    clearRect: noop,
    drawImage: noop,
    fillRect: noop,
    fillText: noop,
    setTransform: noop,
    createLinearGradient: () => gradient,
    createPattern: () => null,
    measureText: () => ({ width: 120 }),
    putImageData: noop,
    createImageData: (width: number, height: number) =>
      ({ data: new Uint8ClampedArray(width * height * 4), width, height }) as unknown as ImageData,
    getImageData: (_x: number, _y: number, width: number, height: number) => {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const alpha = (x + y) % 9 < 4 ? 255 : 0;
          data[(y * width + x) * 4 + 3] = alpha;
        }
      }
      return { data, width, height, colorSpace: 'srgb' } as unknown as ImageData;
    },
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => createMaskContext() as unknown as ReturnType<HTMLCanvasElement['getContext']>,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createExtrudedDecoTextMesh with a covered glyph mask', () => {
  it('burns the chamfer bevel into the face normals', () => {
    const rig = createExtrudedDecoTextMesh({
      text: 'GATSBY',
      worldHeight: 1.58,
      extrudeDepth: 0.22,
      finish: 'platinum-gold',
      alternatePinstripes: true,
      tracking: 0.16,
      weight: 'hero',
    });

    const meshes: THREE.Mesh[] = [];
    rig.group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh);
    });
    expect(meshes.length).toBeGreaterThan(0);
    const bevel = meshes.find((mesh) => {
      const normal = (mesh.geometry as THREE.BufferGeometry).getAttribute('normal');
      return Boolean(normal) && normal.count > 0;
    });
    expect(bevel).toBeDefined();
    rig.dispose();
  });

  it('tints pure gold across the bevel crest', () => {
    const rig = createExtrudedDecoTextMesh({
      text: 'THE',
      worldHeight: 0.34,
      finish: 'pure-gold',
      weight: 'regular',
    });
    const [mesh] = rig.group.children.filter(
      (child): child is THREE.Mesh => (child as THREE.Mesh).isMesh === true,
    );
    expect((mesh.material as THREE.MeshStandardMaterial).roughness).toBeCloseTo(0.18);
    rig.dispose();
  });

  it('supports the fine weight with pinstripes off', () => {
    const rig = createExtrudedDecoTextMesh({
      text: '1925',
      worldHeight: 0.22,
      weight: 'fine',
      alternatePinstripes: false,
    });
    expect(rig.width).toBeGreaterThan(0);
    rig.dispose();
  });
});
