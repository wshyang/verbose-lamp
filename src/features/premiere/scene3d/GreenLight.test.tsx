// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { greenLight } from '../scene/choreography';
import { GreenLight } from './GreenLight';
import { createPremiereStore } from './premiereStore';

const HERO_Z = SEQUENCE_CHAPTERS[SEQUENCE_CHAPTERS.length - 1].zPosition;

async function render(freezeAt: number) {
  const store = createPremiereStore({ freezeAt });
  const renderer = await ReactThreeTestRenderer.create(<GreenLight store={store} />);
  await renderer.advanceFrames(1, 0.016);
  const mesh = renderer.scene.children[0].instance as THREE.Mesh;
  const material = mesh.material as THREE.ShaderMaterial;
  return { renderer, mesh, material, store };
}

describe('GreenLight', () => {
  it('burns behind the Act I gate and moves to the finale bookend', async () => {
    const act1 = await render(1);
    const glow = greenLight(1, HERO_Z);
    expect(act1.material.uniforms.uIntensity.value).toBeCloseTo(glow.intensity);
    expect(act1.material.uniforms.uTime.value).toBe(1);
    expect(act1.mesh.position.z).toBeCloseTo(glow.z);
    expect(act1.mesh.position.x).toBe(0);
    expect(act1.mesh.visible).toBe(true);

    const finale = await render(36.4);
    expect(finale.mesh.position.z).toBeCloseTo(HERO_Z - 7.5);
    expect(finale.material.uniforms.uIntensity.value).toBeGreaterThan(0);
    expect(finale.material.uniforms.uIntensity.value).toBeLessThan(0.65);
  });

  it('hides the light when its intensity dies out', async () => {
    const { mesh, material } = await render(12);
    expect(material.uniforms.uIntensity.value).toBe(0);
    expect(mesh.visible).toBe(false);
  });

  it('draws additively without writing depth', async () => {
    const { material } = await render(1);
    expect(material.transparent).toBe(true);
    expect(material.blending).toBe(THREE.AdditiveBlending);
    expect(material.depthWrite).toBe(false);
    expect(material.fragmentShader).toContain('uIntensity');
  });

  it('follows the store from frame to frame', async () => {
    const store = createPremiereStore();
    const renderer = await ReactThreeTestRenderer.create(<GreenLight store={store} />);
    const material = (renderer.scene.children[0].instance as THREE.Mesh).material as THREE.ShaderMaterial;
    await renderer.advanceFrames(1, 0.02);
    expect(material.uniforms.uTime.value).toBe(0);

    store.setState({ freezeAt: 7 });
    await renderer.advanceFrames(1, 0.02);
    expect(material.uniforms.uTime.value).toBe(7);
  });
});
