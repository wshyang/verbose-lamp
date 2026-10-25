// @vitest-environment jsdom
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

// The border rig's geometry is pinned by its own suites; mocked here at the barrel so what
// is under test is *who creates it, when it is told things, and who disposes it*.
const rigs = vi.hoisted(() => ({
  created: [] as Array<{
    camera: unknown;
    style: { weight: number };
    aspect: number;
    root: THREE.Group;
    setStyle: ReturnType<typeof vi.fn>;
    setEnabled: ReturnType<typeof vi.fn>;
    setViewport: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock('@/features/art-deco-frame', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/art-deco-frame')>();
  return {
    ...actual,
    createScreenBorderRig: (camera: unknown, style: { weight: number }, aspect: number) => {
      const rig = {
        camera,
        style,
        aspect,
        root: new THREE.Group(),
        setStyle: vi.fn(),
        setEnabled: vi.fn(),
        setViewport: vi.fn(),
        update: vi.fn(),
        dispose: vi.fn(),
      };
      rigs.created.push(rig);
      return rig;
    },
  };
});

import { DEFAULT_SCREEN_BORDER_STYLE, SIGNATURE_GENOME } from '@/features/art-deco-frame';
import { createPremiereStore } from './premiereStore';
import { ScreenBorder } from './ScreenBorder';

const last = () => rigs.created[rigs.created.length - 1];

describe('ScreenBorder', () => {
  it('creates one rig on the canvas camera with the store’s style and the canvas aspect', async () => {
    const store = createPremiereStore();
    const before = rigs.created.length;
    const renderer = await ReactThreeTestRenderer.create(<ScreenBorder store={store} />);

    expect(rigs.created.length).toBe(before + 1);
    expect(last().camera).toBeInstanceOf(THREE.Camera);
    expect(last().style.weight).toBe(DEFAULT_SCREEN_BORDER_STYLE.weight);
    expect(last().aspect).toBeGreaterThan(0);
    await renderer.unmount();
  });

  it('starts disabled, matching the store', async () => {
    const renderer = await ReactThreeTestRenderer.create(<ScreenBorder store={createPremiereStore()} />);

    expect(last().setEnabled).toHaveBeenLastCalledWith(false);
    await renderer.unmount();
  });

  it('starts enabled when the store was seeded with the border on', async () => {
    const store = createPremiereStore({ isBorderEnabled: true });
    const renderer = await ReactThreeTestRenderer.create(<ScreenBorder store={store} />);

    expect(last().setEnabled).toHaveBeenLastCalledWith(true);
    await renderer.unmount();
  });

  it('follows the store when the border is switched on and off', async () => {
    const store = createPremiereStore();
    const renderer = await ReactThreeTestRenderer.create(<ScreenBorder store={store} />);
    const rig = last();

    await ReactThreeTestRenderer.act(async () => store.getState().setScreenBorderEnabled(true));
    expect(rig.setEnabled).toHaveBeenLastCalledWith(true);

    await ReactThreeTestRenderer.act(async () => store.getState().setScreenBorderEnabled(false));
    expect(rig.setEnabled).toHaveBeenLastCalledWith(false);
    await renderer.unmount();
  });

  it('hands a new style to the same rig instead of rebuilding it', async () => {
    const store = createPremiereStore();
    const renderer = await ReactThreeTestRenderer.create(<ScreenBorder store={store} />);
    const built = rigs.created.length;
    const rig = last();

    await ReactThreeTestRenderer.act(async () =>
      store.getState().setScreenBorderStyle({ weight: 0.9, genome: { ...SIGNATURE_GENOME } }),
    );

    expect(rig.setStyle).toHaveBeenLastCalledWith(expect.objectContaining({ weight: 0.9 }));
    expect(rigs.created.length).toBe(built);
    await renderer.unmount();
  });

  it('animates with the shader clock every frame', async () => {
    const store = createPremiereStore({ freezeAt: 7 });
    const renderer = await ReactThreeTestRenderer.create(<ScreenBorder store={store} />);

    await renderer.advanceFrames(2, 0.016);

    expect(last().update).toHaveBeenLastCalledWith(7);
    await renderer.unmount();
  });

  it('disposes the rig exactly once on unmount', async () => {
    const renderer = await ReactThreeTestRenderer.create(<ScreenBorder store={createPremiereStore()} />);
    const rig = last();

    await renderer.unmount();

    expect(rig.dispose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing of its own: the rig lives on the camera', async () => {
    const renderer = await ReactThreeTestRenderer.create(<ScreenBorder store={createPremiereStore()} />);

    expect(renderer.scene.children.filter((child) => child.instance === last().root)).toHaveLength(0);
    await renderer.unmount();
  });
});
