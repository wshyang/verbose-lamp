// @vitest-environment jsdom
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { useThree } from '@react-three/fiber';
import { describe, expect, it, vi } from 'vitest';
import type { Camera, Mesh, MeshStandardMaterial, Points, ShaderMaterial } from 'three';
import { AdditiveBlending, Group } from 'three';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { greenLight, searchlightSway } from '../scene/choreography';
import { Backdrop } from './Backdrop';
import { DECO_WALL, DecoWall } from './DecoWall';
import { DUST_COUNT, DUST_SEED, GoldDust, buildDustGeometry } from './GoldDust';
import { GREEN_LIGHT_PLANE, GreenLight } from './GreenLight';
import { SEARCHLIGHT_BEAM, Searchlights } from './Searchlights';
import { createSearchlightTexture } from './searchlightTexture';
import { createPremiereStore } from './premiereStore';

function CameraProbe({ onCamera }: { onCamera: (camera: Camera) => void }) {
  onCamera(useThree((state) => state.camera));
  return null;
}

const mesh = (renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>, name: string) =>
  renderer.scene.findByProps({ name }).instance as Mesh;

describe('buildDustGeometry', () => {
  it('builds one position, scale and phase per fleck', () => {
    const geometry = buildDustGeometry();

    expect(geometry.getAttribute('position').count).toBe(DUST_COUNT);
    expect(geometry.getAttribute('position').itemSize).toBe(3);
    expect(geometry.getAttribute('aScale').count).toBe(DUST_COUNT);
    expect(geometry.getAttribute('aPhase').count).toBe(DUST_COUNT);
    expect(DUST_COUNT).toBe(950);
  });

  // The shipped dust was Math.random() on every load, so no two visits showed the same air
  // and the likeness gate could not pin it. A fixed seed makes it identical every time.
  it('is identical on every call, because the seed is fixed', () => {
    const a = buildDustGeometry().getAttribute('position').array as Float32Array;
    const b = buildDustGeometry().getAttribute('position').array as Float32Array;

    expect(Array.from(a)).toEqual(Array.from(b));
    expect(DUST_SEED).toBe(1920);
  });

  it('keeps every fleck inside the corridor the manager used', () => {
    const geometry = buildDustGeometry();
    const position = geometry.getAttribute('position');
    const scale = geometry.getAttribute('aScale');
    const phase = geometry.getAttribute('aPhase');

    for (let i = 0; i < position.count; i += 1) {
      expect(Math.abs(position.getX(i))).toBeLessThanOrEqual(12);
      expect(Math.abs(position.getY(i))).toBeLessThanOrEqual(7);
      expect(position.getZ(i)).toBeLessThanOrEqual(12);
      expect(position.getZ(i)).toBeGreaterThan(12 - 136);
      expect(scale.getX(i)).toBeGreaterThanOrEqual(0.4);
      expect(scale.getX(i)).toBeLessThanOrEqual(2.2);
      expect(phase.getX(i)).toBeGreaterThanOrEqual(0);
      expect(phase.getX(i)).toBeLessThan(Math.PI * 2);
    }
  });

  it('spans the whole fly-through rather than clumping', () => {
    const position = buildDustGeometry().getAttribute('position');
    const zs = Array.from({ length: position.count }, (_, i) => position.getZ(i));

    expect(Math.max(...zs)).toBeGreaterThan(10);
    expect(Math.min(...zs)).toBeLessThan(-120);
  });

  it('builds a smaller field on request', () => {
    expect(buildDustGeometry(10).getAttribute('position').count).toBe(10);
  });
});

describe('createSearchlightTexture', () => {
  it('draws into a 128 by 256 canvas', () => {
    const texture = createSearchlightTexture();
    const canvas = texture.image as HTMLCanvasElement;

    expect(canvas.width).toBe(128);
    expect(canvas.height).toBe(256);
  });

  it('still hands back a texture over the blank canvas when there is no 2D context', () => {
    const noContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    try {
      expect((createSearchlightTexture().image as HTMLCanvasElement).width).toBe(128);
    } finally {
      noContext.mockRestore();
    }
  });
});

describe('DecoWall', () => {
  it('hangs a metallic wallpaper plane at the back of the ballroom', async () => {
    const renderer = await ReactThreeTestRenderer.create(<DecoWall />);

    const wall = mesh(renderer, 'deco-wall');
    const material = wall.material as MeshStandardMaterial;
    expect(wall.position.toArray()).toEqual([0, 0, -14.5]);
    expect(material.metalness).toBe(0.72);
    expect(material.roughness).toBe(0.55);
    expect(material.envMapIntensity).toBe(0.85);
    expect(material.normalScale.toArray()).toEqual([1.6, 1.6]);
    expect(DECO_WALL.size).toEqual([46, 26]);
    await renderer.unmount();
  });

  it('wears all three procedural wallpaper maps', async () => {
    const renderer = await ReactThreeTestRenderer.create(<DecoWall />);

    const material = mesh(renderer, 'deco-wall').material as MeshStandardMaterial;
    expect(material.map).toBeTruthy();
    expect(material.normalMap).toBeTruthy();
    expect(material.roughnessMap).toBeTruthy();
    await renderer.unmount();
  });

  it('releases its geometry, material and textures on unmount', async () => {
    const renderer = await ReactThreeTestRenderer.create(<DecoWall />);
    const wall = mesh(renderer, 'deco-wall');
    const material = wall.material as MeshStandardMaterial;
    let disposed = 0;
    wall.geometry.addEventListener('dispose', () => (disposed += 1));
    material.addEventListener('dispose', () => (disposed += 1));
    material.map!.addEventListener('dispose', () => (disposed += 1));

    await renderer.unmount();

    expect(disposed).toBe(3);
  });
});

describe('Searchlights', () => {
  it('stands two additive beams either side of the wall', async () => {
    const store = createPremiereStore();
    const renderer = await ReactThreeTestRenderer.create(<Searchlights store={store} />);

    const left = mesh(renderer, 'searchlight-left');
    const right = mesh(renderer, 'searchlight-right');
    expect(left.position.toArray()).toEqual([-6.5, -4, -9.5]);
    expect(right.position.toArray()).toEqual([6.5, -4, -9.5]);
    expect((left.material as { blending: number }).blending).toBe(AdditiveBlending);
    expect((left.material as { depthWrite: boolean }).depthWrite).toBe(false);
    expect(left.material).toBe(right.material);
    expect(SEARCHLIGHT_BEAM.size).toEqual([7.5, 26]);
    await renderer.unmount();
  });

  it('starts at their rest angles', async () => {
    const renderer = await ReactThreeTestRenderer.create(<Searchlights store={createPremiereStore()} />);

    expect(mesh(renderer, 'searchlight-left').rotation.z).toBeCloseTo(-0.38, 12);
    expect(mesh(renderer, 'searchlight-right').rotation.z).toBeCloseTo(0.38, 12);
    await renderer.unmount();
  });

  it('sways with the shader clock', async () => {
    const store = createPremiereStore({ freezeAt: 6 });
    const renderer = await ReactThreeTestRenderer.create(<Searchlights store={store} />);

    await renderer.advanceFrames(1, 0.016);

    const sway = searchlightSway(store.getState().elapsed);
    expect(mesh(renderer, 'searchlight-left').rotation.z).toBeCloseTo(sway.left, 12);
    expect(mesh(renderer, 'searchlight-right').rotation.z).toBeCloseTo(sway.right, 12);
    await renderer.unmount();
  });

  it('shares one texture and releases it on unmount', async () => {
    const renderer = await ReactThreeTestRenderer.create(<Searchlights store={createPremiereStore()} />);
    const material = mesh(renderer, 'searchlight-left').material as unknown as {
      map: { addEventListener: (type: string, listener: () => void) => void };
    };
    let disposed = 0;
    material.map.addEventListener('dispose', () => (disposed += 1));

    await renderer.unmount();

    expect(disposed).toBe(1);
  });
});

describe('GreenLight', () => {
  const heroZ = SEQUENCE_CHAPTERS[SEQUENCE_CHAPTERS.length - 1].zPosition;

  it('floats a glowing plane behind the Act I gate', async () => {
    const renderer = await ReactThreeTestRenderer.create(<GreenLight store={createPremiereStore()} />);

    const light = mesh(renderer, 'green-light');
    expect(light.position.toArray()).toEqual([0, -0.15, -9.5]);
    expect((light.material as ShaderMaterial).blending).toBe(AdditiveBlending);
    expect(GREEN_LIGHT_PLANE.size).toEqual([14, 10]);
    await renderer.unmount();
  });

  it.each([
    ['Act I, fully lit', 1, true, -7.5],
    ['mid-film, dark and hidden', 20, false, -7.5],
    ['the finale bookend, behind the hero card', 36.4, true, heroZ - 7.5],
  ])('%s', async (_label, t, visible, z) => {
    const store = createPremiereStore({ freezeAt: t });
    const renderer = await ReactThreeTestRenderer.create(<GreenLight store={store} />);

    await renderer.advanceFrames(1, 0.016);

    const light = mesh(renderer, 'green-light');
    const beacon = greenLight(t, heroZ);
    expect(light.visible).toBe(visible);
    expect(light.position.z).toBeCloseTo(z, 9);
    expect((light.material as ShaderMaterial).uniforms.uIntensity.value).toBeCloseTo(beacon.intensity, 12);
    await renderer.unmount();
  });

  it('feeds the shader clock to the shader', async () => {
    const store = createPremiereStore({ freezeAt: 3 });
    const renderer = await ReactThreeTestRenderer.create(<GreenLight store={store} />);

    await renderer.advanceFrames(1, 0.016);

    expect((mesh(renderer, 'green-light').material as ShaderMaterial).uniforms.uTime.value).toBe(3);
    await renderer.unmount();
  });
});

describe('GoldDust', () => {
  it('drifts the seeded field as additive points', async () => {
    const renderer = await ReactThreeTestRenderer.create(<GoldDust store={createPremiereStore()} />);

    const points = renderer.scene.findByType('Points').instance as Points;
    const material = points.material as ShaderMaterial;
    expect(points.geometry.getAttribute('position').count).toBe(DUST_COUNT);
    expect(material.blending).toBe(AdditiveBlending);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    await renderer.unmount();
  });

  it('feeds the shader clock and the camera depth to the shader each frame', async () => {
    const store = createPremiereStore({ freezeAt: 4 });
    const renderer = await ReactThreeTestRenderer.create(<GoldDust store={store} />);

    await renderer.advanceFrames(1, 0.016);

    const material = (renderer.scene.findByType('Points').instance as Points).material as ShaderMaterial;
    expect(material.uniforms.uTime.value).toBe(4);
    expect(Number.isFinite(material.uniforms.uCamZ.value)).toBe(true);
    await renderer.unmount();
  });

  it('releases the field’s geometry and material on unmount', async () => {
    const renderer = await ReactThreeTestRenderer.create(<GoldDust store={createPremiereStore()} />);
    const points = renderer.scene.findByType('Points').instance as Points;
    let disposed = 0;
    points.geometry.addEventListener('dispose', () => (disposed += 1));
    (points.material as ShaderMaterial).addEventListener('dispose', () => (disposed += 1));

    await renderer.unmount();

    expect(disposed).toBe(2);
  });
});

describe('Backdrop', () => {
  it('carries the wallpaper and both searchlights in one group', async () => {
    const renderer = await ReactThreeTestRenderer.create(<Backdrop store={createPremiereStore()} />);

    expect(renderer.scene.findByProps({ name: 'backdrop' }).instance).toBeInstanceOf(Group);
    expect(mesh(renderer, 'deco-wall')).toBeTruthy();
    expect(mesh(renderer, 'searchlight-left')).toBeTruthy();
    expect(mesh(renderer, 'searchlight-right')).toBeTruthy();
    await renderer.unmount();
  });

  it('rides 12 behind the camera in cinema mode, whatever depth the camera is at', async () => {
    let camera: Camera | undefined;
    const store = createPremiereStore({ freezeAt: 6 });
    const renderer = await ReactThreeTestRenderer.create(
      <>
        <CameraProbe onCamera={(found) => (camera = found)} />
        <Backdrop store={store} />
      </>,
    );

    for (const z of [10.5, -30, 4]) {
      camera!.position.z = z;
      await renderer.advanceFrames(1, 0.016);

      const group = renderer.scene.findByProps({ name: 'backdrop' }).instance as Group;
      expect(group.position.z).toBeCloseTo(z - 12, 9);
    }
    await renderer.unmount();
  });

  it('hangs 3.5 behind the active card in orbit mode', async () => {
    const chapter = SEQUENCE_CHAPTERS[2];
    const store = createPremiereStore({ freezeAt: chapter.startTime + 1 });
    store.getState().setCameraMode('orbit');
    const renderer = await ReactThreeTestRenderer.create(<Backdrop store={store} />);

    await renderer.advanceFrames(1, 0.016);

    const group = renderer.scene.findByProps({ name: 'backdrop' }).instance as Group;
    expect(group.position.z).toBeCloseTo(chapter.zPosition - 3.5, 9);
    await renderer.unmount();
  });
});
