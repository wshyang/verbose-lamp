// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { createExtrudedDecoTextMesh } from './decoTypography';
import { setupDomTests } from '../../../test/dom';
import { installCanvas2d, type Canvas2d } from '../../../test/canvas2d';

/**
 * `createExtrudedDecoTextMesh` rasterises the pinstripe alphabet into a mask,
 * derives a chamfer heightfield, and bakes albedo + normal textures for a
 * sliced 3D prism. jsdom supplies neither `Path2D` nor a canvas backend, so the
 * two seams are stubbed; the heightfield, colour ramps and material graph are
 * exercised for real (ADDENDUM-029 §4).
 */
const pathLog: string[] = [];
class RecordingPath2D {
  moveTo(...args: number[]) {
    pathLog.push(`moveTo(${args.join(',')})`);
  }

  lineTo(...args: number[]) {
    pathLog.push(`lineTo(${args.join(',')})`);
  }

  arc(...args: number[]) {
    pathLog.push(`arc(${args.join(',')})`);
  }

  quadraticCurveTo(...args: number[]) {
    pathLog.push(`quadraticCurveTo(${args.join(',')})`);
  }

  bezierCurveTo(...args: number[]) {
    pathLog.push(`bezierCurveTo(${args.join(',')})`);
  }

  closePath() {
    pathLog.push('closePath()');
  }
}
// Registered before the module under test constructs any glyph path.
vi.stubGlobal('Path2D', RecordingPath2D);
setupDomTests();
let canvas: Canvas2d;
beforeEach(() => {
  pathLog.length = 0;
  canvas = installCanvas2d();
});
const rig = (overrides: Partial<Parameters<typeof createExtrudedDecoTextMesh>[0]> = {}) =>
  createExtrudedDecoTextMesh({ text: 'GATSBY', worldHeight: 1, ...overrides });
const strokeCalls = (calls: string[] = canvas.calls) =>
  calls.filter((call) => call.startsWith('stroke(')).length;
describe('createExtrudedDecoTextMesh', () => {
  it('stacks a front face plus eleven extruded side slices', () => {
    const { group } = rig();

    expect(group.children).toHaveLength(12);
    for (const child of group.children) {
      expect(child).toBeInstanceOf(THREE.Mesh);
    }
    // Slices march backwards from the front face without protruding.
    const zs = group.children.map((child) => child.position.z);
    expect(zs[0]).toBe(0);
    expect(zs[11]).toBeCloseTo(-(11 / 11) * 0.14, 6);
    expect(Math.min(...zs)).toBeGreaterThanOrEqual(-0.14);
  });

  it('sizes the plane from the rasterised layout aspect', () => {
    const { width, height, group } = rig();

    const geometry = (group.children[0] as THREE.Mesh).geometry as THREE.PlaneGeometry;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    expect(box.max.x - box.min.x).toBeCloseTo(width, 5);
    expect(box.max.y - box.min.y).toBeCloseTo(height, 5);
    // canvasH = capH + 2 * padY, so the world height is 0.72 * its aspect.
    expect(height).toBeCloseTo(1 * ((328 / 220) * 0.72), 6);
    expect(width).toBeGreaterThan(0);
  });

  it('honours an explicit extrusion depth and rear bevel expansion', () => {
    const { group } = rig({ extrudeDepth: 0.5 });

    const last = group.children[11];
    expect(last.position.z).toBeCloseTo(-0.5, 6);
    // t = 1 → 1.008 bevel
    expect(last.scale.x).toBeCloseTo(1.008, 6);
    expect(last.scale.y).toBeCloseTo(1.008, 6);
    expect(last.scale.z).toBe(1);
  });

  it('alternates pinstriped glyphs with solid ones by default', () => {
    // GATSBY → 6 glyphs: 3 pinstriped (4 strokes) + 3 solid (1 stroke).
    rig({ text: 'GATSBY' });
    expect(strokeCalls()).toBe(3 * 4 + 3);

    const alternate = installCanvas2d();
    rig({ text: 'GATSBY', alternatePinstripes: false });
    expect(strokeCalls(alternate.calls)).toBe(6);
  });

  it('carves four concentric stripes per pinstriped glyph', () => {
    rig({ text: 'A', alternatePinstripes: true });

    // 4 strokes on the scratch canvas for the single glyph, then each is copied
    // across by drawImage.
    expect(strokeCalls()).toBe(4);
    expect(canvas.calls.filter((call) => call.startsWith('drawImage('))).toHaveLength(1);
    expect(canvas.calls).toContain('lineWidth=32');
    expect(canvas.calls).toContain('lineWidth=23.04');
    expect(canvas.calls).toContain('lineWidth=14.08');
    expect(canvas.calls).toContain('lineWidth=4.8');
    expect(canvas.calls.filter((call) => call === 'globalCompositeOperation=destination-out')).toHaveLength(2);
  });

  it('strokes a single solid band when pinstripes are off', () => {
    rig({ text: 'AA', alternatePinstripes: false });

    expect(strokeCalls()).toBe(2);
    expect(canvas.calls).toContain('lineWidth=32');
    expect(canvas.calls).not.toContain('globalCompositeOperation=destination-out');
  });

  it('draws real glyph geometry from the shared alphabet', () => {
    rig({ text: 'AB 1' });

    expect(pathLog.some((entry) => entry.startsWith('moveTo('))).toBe(true);
    expect(pathLog.some((entry) => entry.startsWith('lineTo(') || entry.startsWith('arc('))).toBe(true);
  });

  it('falls back to the O glyph for characters outside the alphabet', () => {
    rig({ text: '@' });
    const unknown = [...pathLog];

    pathLog.length = 0;
    rig({ text: 'O' });

    expect(unknown).toEqual(pathLog);
    expect(unknown.length).toBeGreaterThan(0);
  });

  it('clamps runaway phrases to the 2560 px mask budget', () => {
    rig({ text: 'GATSBY '.repeat(12), alternatePinstripes: false });

    const widths = canvas.calls.filter((call) => call.startsWith('createImageData('));
    // createImageData(canvasW, 328)
    expect(widths[0]).toBe('createImageData(2560x328)');
  });

  it('keeps a minimum canvas for empty or space-only text', () => {
    const created = canvas.calls.filter((call) => call.startsWith('getImageData('));
    pathLog.length = 0;

    const { group } = rig({ text: '' });

    expect(group.children).toHaveLength(12);
    // No glyphs were stroked.
    expect(strokeCalls()).toBe(0);
    const masks = canvas.calls.filter((call) => call.startsWith('getImageData('));
    expect(masks.length).toBeGreaterThanOrEqual(created.length);
    // Empty text falls back to a half cap-height cursor, so the 256 px floor wins.
    expect(canvas.calls).toContain('createImageData(256x328)');
  });

  it('strokes thinner bands at lighter weights and wider tracking', () => {
    rig({ text: 'G', weight: 'fine', tracking: 0.4 });
    expect(canvas.calls).toContain('lineWidth=18');

    canvas = installCanvas2d();
    rig({ text: 'G', weight: 'regular' });
    expect(canvas.calls).toContain('lineWidth=24');
  });

  it('bakes a flat normal field where the mask is empty', () => {
    const { group } = rig();
    const material = (group.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const normals = (material.normalMap as THREE.DataTexture).image.data as unknown as Uint8Array;

    // All-zero mask alpha → the chamfer heightfield is uniform → +Z normals.
    expect(normals[0]).toBe(128);
    expect(normals[1]).toBe(128);
    expect(normals[2]).toBe(255);
    expect(normals[3]).toBe(255);
  });

  it('tints the platinum face warm at the bevel and cool at the crest', () => {
    const { group } = rig({ finish: 'platinum-gold' });
    const material = (group.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;

    // With no mask pixels the crest factor is 0 → champagne #eec46c; at crest 1
    // the same ramp reaches platinum silver #f7f6f9.
    expect(canvas.images).toHaveLength(1);
    expect([...canvas.images[0].data.slice(0, 3)]).toEqual([238, 196, 108]);
    expect(material.roughness).toBe(0.13);
    expect((material.color as THREE.Color).getHexString()).toBe('ffffff');
    expect(material.metalness).toBe(0.96);
    expect(material.envMapIntensity).toBe(2.1);
    expect(material.alphaTest).toBe(0.24);
  });

  it('tints pure gold darker and softer on the flank', () => {
    const { group } = rig({ finish: 'pure-gold' });
    const front = (group.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const side = (group.children[1] as THREE.Mesh).material as THREE.MeshStandardMaterial;

    expect([...canvas.images[0].data.slice(0, 3)]).toEqual([215, 166, 58]);
    expect(front.roughness).toBe(0.18);
    expect(side.roughness).toBe(0.25);
    expect(side.color.getHexString()).toBe('d89c27');
    expect(side.emissive.getHexString()).toBe('2a1903');
    expect(front.normalScale.x).toBe(1.45);
    expect(side.normalScale.x).toBe(0.8);
    expect(side.envMapIntensity).toBe(1.5);
    expect((front.map as THREE.CanvasTexture).colorSpace).toBe(THREE.SRGBColorSpace);
    expect((front.map as THREE.CanvasTexture).anisotropy).toBe(8);
    expect((front.normalMap as THREE.DataTexture).flipY).toBe(true);
  });

  it('injects the reveal curtain into both faces and the glint only into the front', () => {
    const { group } = rig();
    const front = (group.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const side = (group.children[1] as THREE.Mesh).material as THREE.MeshStandardMaterial;

    expect(front.customProgramCacheKey!()).toBe('gatsby-deco-text-front-v1');
    expect(side.customProgramCacheKey!()).toBe('gatsby-deco-text-side-v1');

    const compile = () => ({
      uniforms: {} as Record<string, { value: number }>,
      vertexShader: '#include <common>\n#include <uv_vertex>',
      fragmentShader:
        '#include <common>\n#include <alphatest_fragment>\n#include <emissivemap_fragment>',
    });

    const frontShader = compile();
    front.onBeforeCompile(frontShader as never, {} as never);
    expect(frontShader.vertexShader).toContain('varying vec2 vDecoUv;');
    expect(frontShader.vertexShader).toContain('vDecoUv = uv;');
    expect(frontShader.fragmentShader).toContain('float edgeMask');
    expect(frontShader.fragmentShader).toContain('totalEmissiveRadiance += vec3(1.0, 0.86, 0.52)');

    const sideShader = compile();
    side.onBeforeCompile(sideShader as never, {} as never);
    expect(sideShader.fragmentShader).toContain('float edgeMask');
    expect(sideShader.fragmentShader).not.toContain('totalEmissiveRadiance');
    expect(sideShader.fragmentShader).toContain('uniform float uReveal;');
  });

  it('shares one uniform block across the stack and clamps inputs', () => {
    const { group, setReveal } = rig();
    const front = (group.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const side = (group.children[11] as THREE.Mesh).material as THREE.MeshStandardMaterial;

    const frontShader = { uniforms: {} as Record<string, { value: number }>, vertexShader: '', fragmentShader: '' };
    const sideShader = { uniforms: {} as Record<string, { value: number }>, vertexShader: '', fragmentShader: '' };
    front.onBeforeCompile(frontShader as never, {} as never);
    side.onBeforeCompile(sideShader as never, {} as never);

    expect(frontShader.uniforms.uReveal).toBe(sideShader.uniforms.uReveal);
    expect(frontShader.uniforms.uShimmer).toBe(sideShader.uniforms.uShimmer);
    expect(frontShader.uniforms.uOpacity).toBe(sideShader.uniforms.uOpacity);
    expect(frontShader.uniforms.uReveal.value).toBe(1);

    setReveal(2, 0.5, -3);
    expect(frontShader.uniforms.uReveal.value).toBe(1);
    expect(frontShader.uniforms.uShimmer.value).toBe(0.5);
    expect(frontShader.uniforms.uOpacity.value).toBe(0);

    setReveal(-1, 0.25);
    expect(frontShader.uniforms.uReveal.value).toBe(0);
    expect(frontShader.uniforms.uOpacity.value).toBe(1);
  });

  it('disposes the geometry, both materials and both textures', () => {
    const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const materialDispose = vi.spyOn(THREE.Material.prototype, 'dispose');
    const textureDispose = vi.spyOn(THREE.Texture.prototype, 'dispose');

    rig().dispose();

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(2);
    expect(textureDispose).toHaveBeenCalledTimes(2);
  });
});
