// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReactThreeTestRenderer, { act } from '@react-three/test-renderer';
import * as THREE from 'three';
import { DEFAULT_SCREEN_BORDER_STYLE, DEFAULT_FRAME_STYLE } from '@/features/art-deco-frame';
import { DEFAULT_HERO_TITLE, SEQUENCE_CHAPTERS } from '../data/sequence';
import { PremiereScene } from './PremiereScene';
import { createPremiereStore } from './premiereStore';

interface FakeRig {
  root: THREE.Group;
  setFrameStyle: ReturnType<typeof vi.fn>;
  updateState: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}

const rigs = vi.hoisted(() => ({ created: [] as FakeRig[] }));
const border = vi.hoisted(() => ({ setEnabled: vi.fn(), setStyle: vi.fn(), setViewport: vi.fn(), update: vi.fn(), dispose: vi.fn() }));

vi.mock('../scene/decoCards', () => ({
  createGatsbyCardRig: (chapter: { id: string; zPosition: number }) => {
    const root = new THREE.Group();
    root.name = `card-${chapter.id}`;
    root.position.z = chapter.zPosition;
    const rig = {
      chapter,
      root,
      setFrameStyle: vi.fn(),
      updateState: vi.fn(),
      dispose: vi.fn(),
    };
    rigs.created.push(rig as unknown as FakeRig);
    return rig;
  },
}));

vi.mock('../scene/environment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../scene/environment')>();
  const texture = () => ({ dispose: vi.fn() });
  return {
    ...actual,
    createDecoWallpaperTextures: () => ({ map: texture(), normalMap: texture(), roughnessMap: texture() }),
    createBallroomEnvironment: () => texture(),
  };
});

vi.mock('@/features/art-deco-frame', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/art-deco-frame')>();
  return {
    ...actual,
    createScreenBorderRig: () => ({ root: new THREE.Group(), ...border }),
  };
});

function cards(renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>) {
  return (renderer.scene.instance as THREE.Scene).children.filter((child) =>
    child.name.startsWith('card-'),
  );
}

beforeEach(() => {
  rigs.created.length = 0;
  vi.clearAllMocks();
});

describe('PremiereScene', () => {
  it('stages one card per act at its own Z station', async () => {
    const store = createPremiereStore();
    const renderer = await ReactThreeTestRenderer.create(<PremiereScene store={store} />);
    await renderer.advanceFrames(1, 0.016);

    const roots = cards(renderer);
    expect(roots).toHaveLength(SEQUENCE_CHAPTERS.length);
    expect(roots.map((root) => root.position.z)).toEqual(
      SEQUENCE_CHAPTERS.map((chapter) => chapter.zPosition),
    );
    expect(roots.map((root) => root.name)).toEqual(
      SEQUENCE_CHAPTERS.map((chapter) => `card-${chapter.id}`),
    );
    await renderer.unmount();
  });

  it('rebuilds exactly one card when the hero title changes', async () => {
    const store = createPremiereStore();
    const renderer = await ReactThreeTestRenderer.create(<PremiereScene store={store} />);
    const before = cards(renderer).map((root) => root.uuid);

    act(() => {
      store.getState().updateHeroTitle({ ...DEFAULT_HERO_TITLE, mainTitle: 'CARRAWAY' });
    });
    await renderer.advanceFrames(1, 0.016);

    const after = cards(renderer).map((root) => root.uuid);
    expect(after).toHaveLength(before.length);
    const changed = after.filter((uuid, index) => uuid !== before[index]);
    expect(changed).toHaveLength(1);
    await renderer.unmount();
  });

  it('scales the cards down on a coarse-pointer viewport', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <PremiereScene store={createPremiereStore()} hasCoarsePointer />,
      { width: 390, height: 844 },
    );
    await renderer.advanceFrames(1, 0.016);
    const roots = cards(renderer);
    expect(roots[0].scale.x).toBeLessThan(1);
    expect(roots[0].scale.x).toBeGreaterThan(0.3);
    await renderer.unmount();
  });

  it('leaves the cards full size on a desktop viewport', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <PremiereScene store={createPremiereStore()} />,
    );
    await renderer.advanceFrames(1, 0.016);
    expect(cards(renderer)[0].scale.x).toBe(1);
    await renderer.unmount();
  });

  it('shows the screen border only when it is enabled', async () => {
    const store = createPremiereStore();
    const renderer = await ReactThreeTestRenderer.create(<PremiereScene store={store} />);
    expect(border.setEnabled).toHaveBeenLastCalledWith(false);

    act(() => store.getState().setScreenBorderEnabled(true));
    expect(border.setEnabled).toHaveBeenLastCalledWith(true);

    act(() => store.getState().setScreenBorderStyle({ ...DEFAULT_SCREEN_BORDER_STYLE }));
    expect(border.setStyle).toHaveBeenLastCalledWith(DEFAULT_SCREEN_BORDER_STYLE);

    act(() =>
      store.getState().setSequenceFrameStyle({ ...DEFAULT_FRAME_STYLE, intricacy: 0.62 }),
    );
    await renderer.advanceFrames(1, 0.016);
    expect(rigs.created[0].setFrameStyle).toHaveBeenCalledWith(
      expect.objectContaining({ intricacy: 0.62 }),
    );
    await renderer.unmount();
  });
});
