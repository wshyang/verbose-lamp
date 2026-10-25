import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_SCREEN_BORDER_STYLE } from '../engine/frameGrammar';
import { SIGNATURE_GENOME } from '../engine/frameGrammar/genome';
import { createScreenBorderRig } from './ScreenBorderRig';

function createRig(aspect = 1.6, genome = SIGNATURE_GENOME) {
  const camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 180);
  const rig = createScreenBorderRig(
    camera,
    { weight: DEFAULT_SCREEN_BORDER_STYLE.weight, genome: { ...genome } },
    aspect,
  );
  return { camera, rig };
}

describe('createScreenBorderRig', () => {
  it('parents a hidden border to the camera at a fixed distance', () => {
    const { camera, rig } = createRig();
    expect(rig.root.visible).toBe(false);
    expect(camera.children).toContain(rig.root);
    expect(rig.root.position.z).toBe(-3);
    expect(rig.root.scale.x).toBeGreaterThan(0);
    expect(rig.root.children).toHaveLength(1);
    rig.dispose();
  });

  it('rebuilds the geometry when the style or aspect really changes', () => {
    const { rig } = createRig();
    const mesh = rig.root.children[0] as THREE.Mesh;
    const before = mesh.geometry;

    rig.setStyle({ weight: DEFAULT_SCREEN_BORDER_STYLE.weight, genome: SIGNATURE_GENOME });
    expect(mesh.geometry).toBe(before);

    rig.setStyle({ weight: 0.9, genome: { ...SIGNATURE_GENOME, cornerScale: 1.4 } });
    expect(mesh.geometry).not.toBe(before);

    const rebuilt = mesh.geometry;
    rig.setViewport(1.6000001);
    expect(mesh.geometry).toBe(rebuilt);

    rig.setViewport(0.6);
    expect(mesh.geometry).not.toBe(rebuilt);
    expect(rig.root.position.z).toBe(-3);
    rig.dispose();
  });

  it('clamps style input and toggles visibility', () => {
    const { rig } = createRig();
    rig.setStyle({ weight: 4, genome: { ...SIGNATURE_GENOME, cornerScale: 0.4 } });
    const mesh = rig.root.children[0] as THREE.Mesh;
    expect(mesh.geometry.getAttribute('position').count).toBeGreaterThan(0);

    rig.setEnabled(true);
    expect(rig.root.visible).toBe(true);
    rig.setEnabled(false);
    expect(rig.root.visible).toBe(false);
    rig.dispose();
  });

  it('keeps the trim fully drawn while updating the animation clock', () => {
    const { rig } = createRig();
    const mesh = rig.root.children[0] as THREE.Mesh;
    const material = mesh.material as THREE.MeshStandardMaterial;
    const shader = {
      uniforms: {} as Record<string, { value: number }>,
      vertexShader: '#include <common>\n#include <begin_vertex>',
      fragmentShader: '#include <common>',
    };
    (material.onBeforeCompile as unknown as (s: unknown) => void)(shader);

    rig.update(12.5);
    expect(shader.uniforms.uDraw.value).toBe(1);
    expect(shader.uniforms.uPartOpen.value).toBe(0);
    expect(shader.uniforms.uOpacity.value).toBe(1);
    expect(shader.uniforms.uTime.value).toBe(12.5);
    expect(mesh.renderOrder).toBe(10);
    expect(mesh.frustumCulled).toBe(false);
    rig.dispose();
  });

  it('detaches and disposes on teardown', () => {
    const { camera, rig } = createRig();
    const mesh = rig.root.children[0] as THREE.Mesh;
    const disposeGeometry = vi.spyOn(mesh.geometry, 'dispose');
    const disposeMaterial = vi.spyOn(mesh.material as THREE.Material, 'dispose');

    rig.dispose();
    expect(camera.children).not.toContain(rig.root);
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
    expect(disposeMaterial).toHaveBeenCalledTimes(1);
  });
});
