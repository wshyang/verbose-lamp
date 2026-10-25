// @vitest-environment jsdom
import 'vitest-canvas-mock';
import { useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { describe, expect, it } from 'vitest';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { PremiereScene } from './PremiereScene';
import { createPremiereStore, type PremiereStore } from './premiereStore';

function CameraProbe({ onCamera }: { onCamera: (camera: THREE.Camera) => void }) {
  const camera = useThree((state) => state.camera);
  useEffect(() => onCamera(camera), [camera, onCamera]);
  return null;
}

function hasGoldFrame(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.some((material) => material.userData.uniforms)) found = true;
  });
  return found;
}

function cardRoots(scene: THREE.Object3D): THREE.Group[] {
  const expected = new Set(SEQUENCE_CHAPTERS.map((chapter) => chapter.zPosition));
  return scene.children.filter(
    (child): child is THREE.Group =>
      child instanceof THREE.Group && expected.has(child.position.z) && hasGoldFrame(child)
  );
}

function firstFrameGeometry(root: THREE.Object3D): THREE.BufferGeometry {
  let geometry: THREE.BufferGeometry | undefined;
  root.traverse((object) => {
    if (geometry || !(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.some((material) => material.userData.uniforms)) geometry = object.geometry;
  });
  if (!geometry) throw new Error('No frame geometry below card root');
  return geometry;
}

async function renderCore(store: PremiereStore, onCamera: (camera: THREE.Camera) => void) {
  return ReactThreeTestRenderer.create(
    <>
      <PremiereScene store={store} variant="core" />
      <CameraProbe onCamera={onCamera} />
    </>,
    { width: 1440, height: 900 }
  );
}

describe('PremiereScene (core, headless)', () => {
  it('mounts five card roots at the chapter corridor positions', async () => {
    const store = createPremiereStore({ freezeAt: 4.32 });
    const renderer = await renderCore(store, () => undefined);
    await renderer.advanceFrames(1, 0);
    expect(cardRoots(renderer.scene.instance).map((root) => root.position.z)).toEqual(
      SEQUENCE_CHAPTERS.map((chapter) => chapter.zPosition)
    );
    await renderer.unmount();
  });

  it('replacing the hero title replaces exactly the hero root', async () => {
    const store = createPremiereStore({ freezeAt: 33.8 });
    const renderer = await renderCore(store, () => undefined);
    const before = cardRoots(renderer.scene.instance);
    await ReactThreeTestRenderer.act(async () => {
      store.getState().updateHeroTitle({
        ...store.getState().heroConfig,
        mainTitle: 'PREMIERE',
      });
    });
    const after = cardRoots(renderer.scene.instance);
    const beforeByZ = new Map(before.map((root) => [root.position.z, root]));
    for (const root of after) {
      if (root.position.z === SEQUENCE_CHAPTERS[4].zPosition) {
        expect(root).not.toBe(beforeByZ.get(root.position.z));
      } else {
        expect(root).toBe(beforeByZ.get(root.position.z));
      }
    }
    await renderer.unmount();
  });

  it('coalesces two style changes in one frame into one geometry rebuild', async () => {
    const store = createPremiereStore({ freezeAt: 4.32 });
    const renderer = await renderCore(store, () => undefined);
    await renderer.advanceFrames(1, 0);
    const root = cardRoots(renderer.scene.instance)[0];
    const original = firstFrameGeometry(root);
    let disposed = 0;
    original.addEventListener('dispose', () => { disposed += 1; });
    const base = store.getState().frameStyle;
    await ReactThreeTestRenderer.act(async () => {
      store.getState().setSequenceFrameStyle({ ...base, intricacy: 0.2 });
      store.getState().setSequenceFrameStyle({ ...base, intricacy: 0.3 });
    });
    await renderer.advanceFrames(1, 0);
    expect(disposed).toBe(1);
    expect(firstFrameGeometry(root)).not.toBe(original);
    await renderer.unmount();
  });

  it('shows the camera-parented screen border only when enabled', async () => {
    let camera: THREE.Camera | undefined;
    const store = createPremiereStore({ freezeAt: 4.32 });
    const renderer = await renderCore(store, (next) => { camera = next; });
    const borderRoot = () => camera?.children.find((child) => child instanceof THREE.Group);
    expect(borderRoot()?.visible).toBe(false);
    await ReactThreeTestRenderer.act(async () => {
      store.getState().setScreenBorderEnabled(true);
    });
    expect(borderRoot()?.visible).toBe(true);
    await renderer.unmount();
  });
});
