// @vitest-environment jsdom
// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import ReactThreeTestRenderer, { act } from '@react-three/test-renderer';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import { resolveViewportFit } from '../scene/responsiveLayout';
import { CinemaCamera } from './CinemaCamera';
import { createPremiereStore } from './premiereStore';
import { useEffect } from 'react';

const orbitMock = vi.hoisted(() => ({
  instances: [] as Array<{
    camera: THREE.PerspectiveCamera;
    domElement: HTMLElement;
    target: THREE.Vector3;
    update: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }>,
}));
vi.mock('three/examples/jsm/controls/OrbitControls.js', () => ({
  OrbitControls: class {
    camera: THREE.PerspectiveCamera;
    domElement: HTMLElement;
    target = new THREE.Vector3();
    enableDamping = false;
    dampingFactor = 0;
    minDistance = 0;
    maxDistance = 0;
    update = vi.fn();
    dispose = vi.fn();
    constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
      this.camera = camera;
      this.domElement = domElement;
      orbitMock.instances.push(this);
    }
  },
}));
const fit = resolveViewportFit(1440, 900, false);
/** Hands the renderer's own camera to the test; the scene graph does not contain it. */
let camera: THREE.PerspectiveCamera | null = null;
function CameraProbe_p3() {
  const current = useThree((state) => state.camera);
  useEffect(() => {
    camera = current as THREE.PerspectiveCamera;
  }, [current]);
  return null;
}
async function render(store = createPremiereStore({ freezeAt: 4.32 })) {
  const renderer = await ReactThreeTestRenderer.create(
    <>
      <CameraProbe_p3 />
      <CinemaCamera store={store} fit={fit} />
    </>,
  );
  await renderer.advanceFrames(1, 0.016);
  if (!camera) throw new Error('camera probe did not attach');
  return { renderer, store, camera };
}
beforeEach(() => {
  orbitMock.instances.length = 0;
  camera = null;
});
afterEach(() => {
  camera = null;
});
describe('CinemaCamera', () => {
  it('aims with the pointer when live, and ignores it when frozen', async () => {
    const live = await render(createPremiereStore());
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 950, clientY: 250 }));
    await live.renderer.advanceFrames(6, 0.05);
    expect(live.camera.position.x).toBeGreaterThan(0.1);

    const frozen = await render(createPremiereStore({ freezeAt: 0 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, clientY: 0 }));
    await frozen.renderer.advanceFrames(6, 0.05);
    expect(Math.abs(frozen.camera.position.x)).toBeLessThan(0.1);
  });

  it('keeps the mobile framing level', async () => {
    const mobile = resolveViewportFit(390, 844, true);
    const store = createPremiereStore({ freezeAt: 11.28 });
    const renderer = await ReactThreeTestRenderer.create(
      <>
        <CameraProbe_p3 />
        <CinemaCamera store={store} fit={mobile} />
      </>,
    );
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 950, clientY: 250 }));
    await renderer.advanceFrames(3, 0.05);
    expect(camera?.position.x).toBe(0);
    expect(camera?.position.y).toBe(0);
  });

  it('hands the orbit rig the same damping and distance limits as before', async () => {
    const store = createPremiereStore();
    const renderer = await ReactThreeTestRenderer.create(<CinemaCamera store={store} fit={fit} />);
    act(() => store.getState().setCameraMode('orbit'));
    await renderer.advanceFrames(2, 0.016);

    expect(orbitMock.instances[0]).toMatchObject({
      enableDamping: true,
      dampingFactor: 0.06,
      minDistance: 3.2,
      maxDistance: 26,
    });
    // Damping is stepped every frame, exactly as the imperative manager did.
    expect(orbitMock.instances[0].update.mock.calls.length).toBeGreaterThan(1);
  });
});
