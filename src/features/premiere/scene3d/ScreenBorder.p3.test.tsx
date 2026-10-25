// @vitest-environment jsdom
// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DEFAULT_SCREEN_BORDER_STYLE } from '@/features/art-deco-frame';
import { createPremiereStore } from './premiereStore';
import { ScreenBorder } from './ScreenBorder';

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

  it('keeps the border sized to the viewport and disposes it', async () => {
    const { renderer } = await render();
    expect(rig.setViewport).toHaveBeenCalledTimes(1);
    expect(rig.setViewport.mock.calls[0][0]).toBeGreaterThan(0);

    await renderer.unmount();
    expect(rig.dispose).toHaveBeenCalledTimes(1);
  });
});
