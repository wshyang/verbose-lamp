import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createScreenBorderRig, finishFor } from './ScreenBorderRig';
import { DEFAULT_SCREEN_BORDER_STYLE } from '../engine/frameGrammar/types';

/**
 * A Three.js camera and group are plain objects, so the proscenium rig is
 * exercised headless: rebuild policy, the brass swap and disposal are all real
 * behaviour, not mock calls (ADDENDUM-028 §3).
 */
function rig(style = { ...DEFAULT_SCREEN_BORDER_STYLE, genome: { ...DEFAULT_SCREEN_BORDER_STYLE.genome } }) {
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
  const instance = createScreenBorderRig(camera, style, 16 / 9);
  const mesh = instance.root.children[0] as THREE.Mesh;
  return { camera, instance, mesh };
}

describe('createScreenBorderRig', () => {
  it('parents the proscenium to the camera, hidden until enabled', () => {
    const { camera, instance } = rig();
    expect(instance.root.parent).toBe(camera);
    expect(instance.root.visible).toBe(false);

    instance.setEnabled(true);
    expect(instance.root.visible).toBe(true);
    instance.setEnabled(false);
    expect(instance.root.visible).toBe(false);
  });

  it('places itself at the frustum edge', () => {
    const { instance } = rig();
    expect(instance.root.position.z).toBe(-3);
    expect(instance.root.scale.x).toBeCloseTo(3 * Math.tan(THREE.MathUtils.degToRad(25)), 6);
  });

  it('draws the printed poster in 24k gold by default', () => {
    const { mesh, instance } = rig({ ...DEFAULT_SCREEN_BORDER_STYLE, weight: 0.5 });
    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material.color.getHexString()).toBe('f4c95d');
    expect(mesh.geometry.getAttribute('position').count).toBeGreaterThan(0);
    instance.dispose();
  });

  it('switches to the brass lattice proscenium and rebuilds the geometry', () => {
    const { mesh, instance } = rig();
    const posterGeometry = mesh.geometry;
    const posterTone = posterGeometry.getAttribute('aTone');

    instance.setStyle({ ...DEFAULT_SCREEN_BORDER_STYLE, pattern: 'lattice', seed: 1925 });

    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material.color.getHexString()).toBe('ba9c72');
    expect(mesh.geometry).not.toBe(posterGeometry);
    expect(posterTone.array.every((value: number, index: number) => (index % 2 === 0 ? value === 0.5 : value === 0))).toBe(true);

    const tones = Array.from(mesh.geometry.getAttribute('aTone').array as Float32Array).filter(
      (_: number, index: number) => index % 2 === 0
    );
    expect(new Set(tones).size).toBeGreaterThan(1);
    instance.dispose();
  });

  it('goes back to gold when the poster pattern returns', () => {
    const { mesh, instance } = rig({ ...DEFAULT_SCREEN_BORDER_STYLE, pattern: 'lattice' });
    expect((mesh.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('ba9c72');

    instance.setStyle({ ...DEFAULT_SCREEN_BORDER_STYLE, pattern: 'poster' });

    expect((mesh.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('f4c95d');
    instance.dispose();
  });

  it('skips the rebuild when nothing that shapes the border changed', () => {
    const { mesh, instance } = rig();
    const geometry = mesh.geometry;
    const material = mesh.material;

    instance.setStyle({ ...DEFAULT_SCREEN_BORDER_STYLE, weight: 0.5 });

    expect(mesh.geometry).toBe(geometry);
    expect(mesh.material).toBe(material);
    instance.dispose();
  });

  it('rebuilds on weight and on the seed', () => {
    const { mesh, instance } = rig();
    const first = mesh.geometry;

    instance.setStyle({ ...DEFAULT_SCREEN_BORDER_STYLE, weight: 0.9 });
    const second = mesh.geometry;
    expect(second).not.toBe(first);

    instance.setStyle({ ...DEFAULT_SCREEN_BORDER_STYLE, weight: 0.9, pattern: 'lattice', seed: 7 });
    instance.setStyle({ ...DEFAULT_SCREEN_BORDER_STYLE, weight: 0.9, pattern: 'lattice', seed: 8 });
    expect(mesh.geometry).not.toBe(second);
    instance.dispose();
  });

  it('re-fits the viewport without thrashing on tiny changes', () => {
    const { mesh, instance } = rig();
    const geometry = mesh.geometry;
    const before = instance.root.scale.x;

    instance.setViewport(16 / 9);
    expect(mesh.geometry).toBe(geometry);

    instance.setViewport(4 / 3);
    expect(mesh.geometry).not.toBe(geometry);
    expect(instance.root.scale.x).toBeCloseTo(before, 6);
    instance.dispose();
  });

  it('drives the shared uniforms every frame', () => {
    const { instance } = rig();
    const spy = vi.spyOn(instance, 'update');
    instance.update(12.5);
    expect(spy).toHaveBeenCalledWith(12.5);
    instance.dispose();
  });

  it('detaches from the camera and disposes its own resources', () => {
    const { camera, instance, mesh } = rig();
    const geometryDispose = vi.spyOn(mesh.geometry, 'dispose');
    const materialDispose = vi.spyOn(mesh.material as THREE.Material, 'dispose');

    instance.dispose();

    expect(instance.root.parent).toBeNull();
    expect(camera.children).not.toContain(instance.root);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });
});

describe('finishFor', () => {
  it('gives the lattice proscenium the brass finish and the poster gold', () => {
    expect(finishFor('lattice')).toBe('brass');
    expect(finishFor('poster')).toBe('gold');
  });
});
