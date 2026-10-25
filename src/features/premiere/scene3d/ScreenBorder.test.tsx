// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReactThreeTestRenderer, { act } from '@react-three/test-renderer';
import * as THREE from 'three';
import { DEFAULT_SCREEN_BORDER_STYLE } from '@/features/art-deco-frame';
import { ScreenBorder } from './ScreenBorder';
import { createPremiereStore } from './premiereStore';

const rig = vi.hoisted(() => ({
  setStyle: vi.fn(),
  setEnabled: vi.fn(),
  setViewport: vi.fn(),
  update: vi.fn(),
  dispose: vi.fn(),
  created: [] as Array<{ camera: unknown; style: unknown; aspect: number }>,
}));

vi.mock('@/features/art-deco-frame', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/art-deco-frame')>();
  return {
    ...actual,
    createScreenBorderRig: (camera: unknown, style: unknown, aspect: number) => {
      rig.created.push({ camera, style, aspect });
      return {
        root: new THREE.Group(),
        setStyle: rig.setStyle,
        setEnabled: rig.setEnabled,
        setViewport: rig.setViewport,
        update: rig.update,
        dispose: rig.dispose,
      };
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  rig.created.length = 0;
});

async function render(store = createPremiereStore({ freezeAt: 3 })) {
  const renderer = await ReactThreeTestRenderer.create(<ScreenBorder store={store} />);
  await renderer.advanceFrames(1, 0.016);
  return { renderer, store };
}

describe('ScreenBorder', () => {
  it('builds the proscenium from the camera, the style and the viewport aspect', async () => {
    const store = createPremiereStore({ freezeAt: 3 });
    const { renderer } = await render(store);

    expect(rig.created).toHaveLength(1);
    const [{ camera, style, aspect }] = rig.created;
    expect((camera as THREE.Camera).isCamera).toBe(true);
    expect(style).toEqual(DEFAULT_SCREEN_BORDER_STYLE);
    expect(aspect).toBeGreaterThan(0);
    expect(rig.setEnabled).toHaveBeenCalledWith(false);
    await renderer.unmount();
  });

  it('follows the enabled flag, the style and the shader clock', async () => {
    const { renderer, store } = await render();

    act(() => store.getState().setScreenBorderEnabled(true));
    expect(rig.setEnabled).toHaveBeenLastCalledWith(true);

    act(() =>
      store.getState().setScreenBorderStyle({ weight: 0.4, genome: DEFAULT_SCREEN_BORDER_STYLE.genome }),
    );
    expect(rig.setStyle).toHaveBeenLastCalledWith(expect.objectContaining({ weight: 0.4 }));

    await renderer.advanceFrames(1, 0.016);
    expect(rig.update).toHaveBeenLastCalledWith(3);

    act(() => store.setState({ freezeAt: 12 }));
    await renderer.advanceFrames(1, 0.016);
    expect(rig.update).toHaveBeenLastCalledWith(12);
    await renderer.unmount();
  });

  it('keeps the border sized to the viewport and disposes it', async () => {
    const { renderer } = await render();
    expect(rig.setViewport).toHaveBeenCalledTimes(1);
    expect(rig.setViewport.mock.calls[0][0]).toBeGreaterThan(0);

    await renderer.unmount();
    expect(rig.dispose).toHaveBeenCalledTimes(1);
  });
});
