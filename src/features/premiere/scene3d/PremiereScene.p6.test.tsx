// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { setupDomTests } from '@/test/dom';
import { SIGNATURE_GENOME } from '@/features/art-deco-frame';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { resolveViewportFit } from '../scene/responsiveLayout';
import { createPremiereStore } from './premiereStore';

setupDomTests();

/**
 * The composed scene without the two parts that need real GL — the environment bake and
 * the post pipeline (ADDENDUM-022 §7). Everything else is the port as it ships.
 */

const rigs = vi.hoisted(() => ({ cards: [] as unknown[], borders: [] as unknown[] }));

vi.mock('../scene/decoCards', () => ({
  createGatsbyCardRig: (chapter: { id: string; zPosition: number }, options: { heroOverride?: { mainTitle: string } }) => {
    const root = new THREE.Group();
    root.name = `card-${chapter.id}`;
    root.position.z = chapter.zPosition;
    const rig = {
      chapter,
      root,
      heroTitle: options.heroOverride?.mainTitle,
      setFrameStyle: vi.fn(),
      updateState: vi.fn(),
      dispose: vi.fn(),
    };
    rigs.cards.push(rig);
    return rig;
  },
}));

vi.mock('@/features/art-deco-frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/art-deco-frame')>()),
  createScreenBorderRig: () => {
    const rig = {
      root: new THREE.Group(),
      setStyle: vi.fn(),
      setEnabled: vi.fn(),
      setViewport: vi.fn(),
      update: vi.fn(),
      dispose: vi.fn(),
    };
    rigs.borders.push(rig);
    return rig;
  },
}));

// The wallpaper bake draws on Canvas 2D, which jsdom does not have; the texture set is
// not what this suite is about.
vi.mock('../scene/environment', () => ({
  createDecoWallpaperTextures: () => ({
    map: new THREE.Texture(),
    normalMap: new THREE.DataTexture(new Uint8Array(4), 1, 1),
    roughnessMap: new THREE.Texture(),
  }),
  createBallroomEnvironment: () => new THREE.Texture(),
}));

import { PremiereScene } from './PremiereScene';

const fit = resolveViewportFit(1440, 900, false);

const mount = (store = createPremiereStore()) =>
  ReactThreeTestRenderer.create(
    <PremiereScene store={store} fit={fit} />
  );

describe('PremiereScene', () => {
  it('mounts one card per chapter, each at its own Z plane', async () => {
    const renderer = await mount();

    expect(rigs.cards).toHaveLength(SEQUENCE_CHAPTERS.length);
    const zs = (rigs.cards as { root: THREE.Group }[]).map((rig) => rig.root.position.z);
    expect(zs).toEqual(SEQUENCE_CHAPTERS.map((chapter) => chapter.zPosition));

    await renderer.unmount();
  });

  it('mounts the atmospheric world: wall, two beams, beacon, dust and the rig', async () => {
    const renderer = await mount();
    const names = renderer.scene.findAllByType('Mesh').map((node) => node.props.name);

    expect(names).toContain('deco-wall');
    expect(names).toContain('searchlight-left');
    expect(names).toContain('searchlight-right');
    expect(names).toContain('green-light');
    expect(renderer.scene.findAllByType('Points')).not.toHaveLength(0);

    await renderer.unmount();
  });

  it('creates the screen border disabled, and only shows it when asked', async () => {
    const store = createPremiereStore();
    const renderer = await mount(store);
    const border = rigs.borders.at(-1) as { setEnabled: ReturnType<typeof vi.fn>; setStyle: ReturnType<typeof vi.fn> };

    expect(border.setEnabled).toHaveBeenCalledWith(false);

    store.getState().setScreenBorderEnabled(true);
    await renderer.advanceFrames(1, 0.016);
    expect(border.setEnabled).toHaveBeenLastCalledWith(true);

    store.getState().setScreenBorderStyle({ weight: 0.9, genome: { ...SIGNATURE_GENOME }, pattern: 'lattice', seed: 4 });
    await renderer.advanceFrames(1, 0.016);
    expect(border.setStyle).toHaveBeenLastCalledWith(
      expect.objectContaining({ weight: 0.9, pattern: 'lattice', seed: 4 })
    );

    await renderer.unmount();
  });

  it('scales every card to the viewport fit', async () => {
    const store = createPremiereStore();
    const mobile = resolveViewportFit(390, 844, true);
    const renderer = await ReactThreeTestRenderer.create(
      <PremiereScene store={store} fit={mobile} />
    );

    for (const rig of rigs.cards.slice(-SEQUENCE_CHAPTERS.length) as { root: THREE.Group }[]) {
      expect(rig.root.scale.x).toBeCloseTo(mobile.cardScale, 9);
    }

    await renderer.unmount();
  });
});
