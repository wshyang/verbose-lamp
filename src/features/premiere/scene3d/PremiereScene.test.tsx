// @vitest-environment jsdom
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

// The card rig and the border rig are mocked at their seams; their geometry is pinned by
// their own suites. What is under test is the composition: what mounts, in what shape.
const rigs = vi.hoisted(() => ({
  cards: [] as Array<{ chapter: { id: string }; root: THREE.Group; dispose: ReturnType<typeof vi.fn> }>,
  borders: 0,
}));

vi.mock('../scene/decoCards', () => ({
  createGatsbyCardRig: (chapter: { id: string }) => {
    const rig = {
      chapter,
      root: new THREE.Group(),
      setFrameStyle: vi.fn(),
      updateState: vi.fn(),
      dispose: vi.fn(),
    };
    rigs.cards.push(rig);
    return rig;
  },
}));

vi.mock('@/features/art-deco-frame', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/art-deco-frame')>();
  return {
    ...actual,
    createScreenBorderRig: () => {
      rigs.borders += 1;
      return {
        root: new THREE.Group(),
        setStyle: vi.fn(),
        setEnabled: vi.fn(),
        setViewport: vi.fn(),
        update: vi.fn(),
        dispose: vi.fn(),
      };
    },
  };
});

import { DEFAULT_HERO_TITLE, SEQUENCE_CHAPTERS } from '../data/sequence';
import { resolveViewportFit } from '../scene/responsiveLayout';
import { createPremiereStore } from './premiereStore';
import { PremiereScene } from './PremiereScene';

const FIT = resolveViewportFit(1280, 720, false);
const PHONE = resolveViewportFit(390, 844, true);
const cardRoots = () => rigs.cards.slice(-SEQUENCE_CHAPTERS.length);

async function mount(
  store = createPremiereStore(),
  fit = FIT,
  extra: Partial<Parameters<typeof PremiereScene>[0]> = {},
) {
  rigs.cards.length = 0;
  rigs.borders = 0;
  return ReactThreeTestRenderer.create(<PremiereScene store={store} fit={fit} {...extra} />);
}

describe('PremiereScene composition', () => {
  it('mounts one card per chapter, named by position', async () => {
    const renderer = await mount();

    expect(rigs.cards).toHaveLength(SEQUENCE_CHAPTERS.length);
    SEQUENCE_CHAPTERS.forEach((chapter, index) => {
      expect(renderer.scene.findByProps({ name: `title-card-${index}` })).toBeTruthy();
      expect(rigs.cards[index].chapter).toBe(chapter);
    });
    await renderer.unmount();
  });

  it('mounts the atmospheric world: wall, two beams, green light, dust and the lights', async () => {
    const renderer = await mount();

    for (const name of ['backdrop', 'deco-wall', 'searchlight-left', 'searchlight-right', 'green-light', 'gold-dust']) {
      expect(renderer.scene.findByProps({ name })).toBeTruthy();
    }
    for (const name of ['rig-key', 'rig-rim', 'rig-cool']) {
      expect(renderer.scene.findByProps({ name })).toBeTruthy();
    }
    expect(renderer.scene.findAllByType('AmbientLight')).toHaveLength(1);
    await renderer.unmount();
  });

  it('nests the wall and the beams inside the backdrop group', async () => {
    const renderer = await mount();

    const backdrop = renderer.scene.findByProps({ name: 'backdrop' });
    const names = backdrop.allChildren.map((child) => child.props.name);
    expect(names).toEqual(expect.arrayContaining(['deco-wall', 'searchlight-left', 'searchlight-right']));
    await renderer.unmount();
  });

  it('creates the screen border once', async () => {
    const renderer = await mount();

    expect(rigs.borders).toBe(1);
    await renderer.unmount();
  });

  it('mounts exactly one field of dust', async () => {
    const renderer = await mount();

    expect(renderer.scene.findAllByType('Points')).toHaveLength(1);
    await renderer.unmount();
  });
});

describe('PremiereScene viewport fit', () => {
  it('scales every card to the viewport fit', async () => {
    const renderer = await mount(createPremiereStore(), PHONE);

    for (const rig of cardRoots()) expect(rig.root.scale.x).toBe(PHONE.cardScale);
    expect(PHONE.cardScale).toBeLessThan(1);
    await renderer.unmount();
  });

  it('re-scales the cards when the fit changes, without rebuilding them', async () => {
    const store = createPremiereStore();
    const renderer = await mount(store, FIT);
    const built = rigs.cards.length;

    await renderer.update(<PremiereScene store={store} fit={PHONE} />);

    for (const rig of cardRoots()) expect(rig.root.scale.x).toBe(PHONE.cardScale);
    expect(rigs.cards.length).toBe(built);
    await renderer.unmount();
  });
});

describe('PremiereScene hero title', () => {
  it('replaces exactly one card root when the hero title changes', async () => {
    const store = createPremiereStore();
    const renderer = await mount(store);
    const built = rigs.cards.length;

    store.getState().setHeroConfig({ ...DEFAULT_HERO_TITLE, mainTitle: 'DAISY' });
    await renderer.advanceFrames(1, 0.016);

    expect(rigs.cards.length).toBe(built + 1);
    expect(rigs.cards.filter((rig) => rig.dispose.mock.calls.length > 0)).toHaveLength(1);
    await renderer.unmount();
  });
});

describe('PremiereScene clock wiring', () => {
  it('runs the clock, so the playhead moves', async () => {
    const store = createPremiereStore();
    const renderer = await mount(store);

    await renderer.advanceFrames(5, 0.016);

    expect(store.getState().currentTime).toBeGreaterThan(0);
    await renderer.unmount();
  });

  it('passes the host callbacks through to the clock', async () => {
    const onTelemetry = vi.fn();
    const onChapterChange = vi.fn();
    const onFrameReady = vi.fn();
    const renderer = await mount(createPremiereStore(), FIT, { onTelemetry, onChapterChange, onFrameReady });

    await renderer.advanceFrames(4, 0.016);

    expect(onChapterChange).toHaveBeenCalledWith(0);
    expect(onTelemetry).toHaveBeenCalled();
    expect(onFrameReady).toHaveBeenCalledTimes(1);
    await renderer.unmount();
  });

  it('disposes every card on unmount', async () => {
    const renderer = await mount();
    const mounted = [...rigs.cards];

    await renderer.unmount();

    for (const rig of mounted) expect(rig.dispose).toHaveBeenCalledTimes(1);
  });
});
