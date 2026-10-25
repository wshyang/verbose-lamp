import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createScreenBorderRig } from './ScreenBorderRig';
import {
  applyFinish, createGoldFrameMaterial, createGoldFrameUniforms, finishForFormula,
} from './frameMaterial';
import { createChamferedFrameGeometry, toneAngleFor } from './railGeometry';
import { SIGNATURE_GENOME } from '../engine/frameGrammar/genome';
import type { PolylineSpec } from '../engine/frameGrammar/types';

function fakeShader() {
  return {
    uniforms: {} as Record<string, unknown>,
    vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: [
      '#include <common>', '#include <clipping_planes_fragment>', '#include <color_fragment>',
      '#include <roughnessmap_fragment>', '#include <metalnessmap_fragment>',
      '#include <emissivemap_fragment>', '#include <opaque_fragment>',
    ].join('\n'),
  };
}

describe('frame material', () => {
  it('creates default/custom uniforms and applies both finishes', () => {
    expect(createGoldFrameUniforms()).toEqual({
      uDraw: { value: 0 }, uPartOpen: { value: 0 }, uOpacity: { value: 1 }, uTime: { value: 0 }, uBrass: { value: 0 },
    });
    const uniforms = createGoldFrameUniforms(0.4, 0.6);
    applyFinish(uniforms, 'brass');
    expect(uniforms.uBrass.value).toBe(1);
    applyFinish(uniforms, 'gold');
    expect(uniforms.uBrass.value).toBe(0);
  });

  it('resolves formula finishes across sources and enabled layers', () => {
    expect(finishForFormula({ source: 'lattice' })).toBe('brass');
    expect(finishForFormula({ source: 'authored', layers: [{ source: 'lattice', enabled: true }] })).toBe('brass');
    expect(finishForFormula({ source: 'authored', layers: [{ source: 'lattice', enabled: false }] })).toBe('gold');
    expect(finishForFormula({ source: 'authored', layers: [{ source: 'none', enabled: true }] })).toBe('gold');
    expect(finishForFormula({ source: 'authored' })).toBe('gold');
  });

  it('builds gold/brass materials and injects all shader chunks', () => {
    for (const [finish, brass] of [[undefined, 0], ['gold', 0], ['brass', 1]] as const) {
      const uniforms = createGoldFrameUniforms();
      const material = createGoldFrameMaterial(uniforms, finish ? { finish } : undefined);
      expect(uniforms.uBrass.value).toBe(brass);
      expect(material.userData.uniforms).toBe(uniforms);
      expect(material.customProgramCacheKey()).toBe('gatsby-gold-frame-trim-v3');
      const shader = fakeShader();
      material.onBeforeCompile(shader as never, null as never);
      expect(shader.uniforms).toMatchObject({ uDraw: uniforms.uDraw, uBrass: uniforms.uBrass });
      expect(shader.vertexShader).toContain('attribute vec3 aPathData');
      expect(shader.fragmentShader).toContain('brassDark');
      expect(shader.fragmentShader).toContain('gl_FragColor.a *= uOpacity');
      material.dispose();
    }
  });
});

function spec(points: PolylineSpec['points'], overrides: Partial<PolylineSpec> = {}): PolylineSpec {
  return { points, width: 0.1, depth: 0.02, kind: 'frame', delay: 0.2, z: 0, ...overrides };
}

describe('rail geometry', () => {
  it('handles empty, short, degenerate, open, closed, tone, and parting branches', () => {
    expect(toneAngleFor(0.5)).toBeCloseTo(3.5999445);
    const geometry = createChamferedFrameGeometry([
      spec([{ x: 0, y: 0 }]),
      spec([{ x: 0, y: 0 }, { x: 0, y: 0 }]),
      spec([{ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }]),
      spec([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }], { partDir: 2, tone: 0.4 }),
      spec([{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: -1, y: 1 }], { partDir: 0 }),
      spec([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], { partDir: 0 }),
      spec([{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 1 }], { closed: true }),
      spec(
        [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }],
        { closed: true, tone: 0.7 }
      ),
    ]);
    const position = geometry.getAttribute('position');
    const path = geometry.getAttribute('aPathData');
    const tone = geometry.getAttribute('aTone');
    expect(position.count).toBeGreaterThan(0);
    expect(geometry.getIndex()?.count).toBeGreaterThan(0);
    expect(Array.from(path.array).some((value) => value === 2)).toBe(true);
    expect(Array.from(tone.array).some((value) => Math.abs(value - 0.7) < 1e-6)).toBe(true);
    expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
    geometry.dispose();
  });

  it('builds an empty indexed geometry from no specs', () => {
    const geometry = createChamferedFrameGeometry([]);
    expect(geometry.getAttribute('position').count).toBe(0);
    expect(geometry.getIndex()?.count).toBe(0);
    geometry.dispose();
  });
});

describe('ScreenBorderRig', () => {
  it('places, restyles, resizes, updates, toggles, and disposes', () => {
    const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 100);
    const initial = { weight: 0.5, genome: { ...SIGNATURE_GENOME }, pattern: 'poster' as const };
    const rig = createScreenBorderRig(camera, initial, 16 / 9);
    const mesh = rig.root.children[0] as THREE.Mesh;
    const material = mesh.material as THREE.MeshStandardMaterial;
    const firstGeometry = mesh.geometry;
    expect(camera.children).toContain(rig.root);
    expect(rig.root.visible).toBe(false);
    expect(rig.root.position.z).toBe(-3);
    expect(mesh.renderOrder).toBe(10);

    rig.setStyle({ ...initial });
    expect(mesh.geometry).toBe(firstGeometry);
    rig.setStyle({ weight: 4, genome: { ...SIGNATURE_GENOME }, pattern: 'lattice' });
    expect(mesh.geometry).not.toBe(firstGeometry);
    expect(material.userData.uniforms.uBrass.value).toBe(1);
    const latticeGeometry = mesh.geometry;
    rig.setStyle({ weight: 1, genome: { ...SIGNATURE_GENOME }, pattern: 'lattice' });
    expect(mesh.geometry).toBe(latticeGeometry);

    rig.setViewport(16 / 9);
    expect(mesh.geometry).toBe(latticeGeometry);
    rig.setViewport(1);
    expect(mesh.geometry).not.toBe(latticeGeometry);
    rig.setEnabled(true);
    rig.update(12);
    expect(rig.root.visible).toBe(true);
    expect(material.userData.uniforms).toMatchObject({
      uDraw: { value: 1 }, uPartOpen: { value: 0 }, uOpacity: { value: 1 }, uTime: { value: 12 },
    });
    rig.setEnabled(false);
    const dispose = vi.spyOn(mesh.geometry, 'dispose');
    rig.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    expect(camera.children).not.toContain(rig.root);
  });

  it('defaults a missing pattern to the gold poster edge', () => {
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 10);
    const rig = createScreenBorderRig(camera, { weight: -2, genome: { ...SIGNATURE_GENOME } }, 1);
    const mesh = rig.root.children[0] as THREE.Mesh;
    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material.userData.uniforms.uBrass.value).toBe(0);
    rig.dispose();
  });
});
