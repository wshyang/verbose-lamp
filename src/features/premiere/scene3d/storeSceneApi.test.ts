import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FRAME_STYLE,
  DEFAULT_SCREEN_BORDER_STYLE,
  SIGNATURE_GENOME,
} from '@/features/art-deco-frame';
import { DEFAULT_HERO_TITLE, SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { CHAPTER_JUMP_OFFSET } from '../scene/styleClamp';
import type { PremiereSceneApi } from '../scene/sceneApi';
import { createPremiereStore } from './premiereStore';
import { storeSceneApi } from './storeSceneApi';

// The adapter is what lets the transport, the scene options and Frame Studio stay exactly
// as they are: they keep calling the same methods, and only the object behind the ref
// changes. Every method must reach the store.
describe('storeSceneApi', () => {
  it('implements the whole PremiereSceneApi surface over a store', () => {
    const store = createPremiereStore();
    const api = storeSceneApi(store);

    api.setTime(6.7);
    expect(store.getState().currentTime).toBeCloseTo(6.7, 9);

    api.setPlaying(false);
    expect(store.getState().isPlaying).toBe(false);
    expect(api.togglePlaying()).toBe(true);

    api.jumpToChapter(3);
    expect(store.getState().currentTime).toBeCloseTo(
      SEQUENCE_CHAPTERS[3].startTime + CHAPTER_JUMP_OFFSET,
      9,
    );

    api.setCameraMode('orbit');
    expect(store.getState().cameraMode).toBe('orbit');
    api.setCameraMode('cinema');
    expect(store.getState().cameraMode).toBe('cinema');

    api.setNitrateMode(true);
    expect(store.getState().isNitrateForced).toBe(true);

    api.updateHeroTitle({ ...DEFAULT_HERO_TITLE, mainTitle: 'DAISY' });
    expect(store.getState().heroConfig.mainTitle).toBe('DAISY');

    api.setSequenceFrameStyle({ ...DEFAULT_FRAME_STYLE, intricacy: 9 });
    expect(store.getState().frameStyle.intricacy).toBe(1);

    api.setScreenBorderStyle({
      ...DEFAULT_SCREEN_BORDER_STYLE,
      genome: { ...SIGNATURE_GENOME },
      weight: 0.9,
    });
    expect(store.getState().borderStyle.weight).toBe(0.9);

    api.setScreenBorderEnabled(true);
    expect(store.getState().isBorderEnabled).toBe(true);
  });

  it('answers every method the port declares', () => {
    const api: PremiereSceneApi = storeSceneApi(createPremiereStore());

    for (const method of [
      'updateHeroTitle',
      'jumpToChapter',
      'setTime',
      'setPlaying',
      'togglePlaying',
      'setCameraMode',
      'setNitrateMode',
      'setSequenceFrameStyle',
      'setScreenBorderStyle',
      'setScreenBorderEnabled',
      'dispose',
    ] as const) {
      expect(typeof api[method]).toBe('function');
    }
  });

  it('always acts on the live state, not the state at construction time', () => {
    const store = createPremiereStore();
    const api = storeSceneApi(store);

    store.getState().setTime(TOTAL_SEQUENCE_DURATION - 1);
    api.setPlaying(false);

    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().currentTime).toBeCloseTo(TOTAL_SEQUENCE_DURATION - 1, 9);
  });

  it('reports the toggle result straight from the store, both ways', () => {
    const api = storeSceneApi(createPremiereStore());

    expect(api.togglePlaying()).toBe(false);
    expect(api.togglePlaying()).toBe(true);
  });
});

// PR #3 found this one, in a real browser: dispose() there paused the clock, so React
// StrictMode's mount -> dispose -> remount in development left the premiere loaded but
// paused, and it needed an `armScene` call to undo it. dispose() here does nothing, because
// the Canvas owns every GPU resource and releases it on unmount, so the bug cannot occur.
describe('storeSceneApi dispose (StrictMode round trip)', () => {
  it('does nothing, and does not touch the store', () => {
    const store = createPremiereStore();
    const before = store.getState();

    expect(() => storeSceneApi(store).dispose()).not.toThrow();

    expect(store.getState()).toBe(before);
  });

  it('leaves a live premiere playing after a mount, dispose, remount cycle', () => {
    const store = createPremiereStore();

    const first = storeSceneApi(store);
    first.dispose();
    const second = storeSceneApi(store);

    expect(second.togglePlaying()).toBe(false);
    expect(second.togglePlaying()).toBe(true);
    store.getState().advance(0.016);
    expect(store.getState().currentTime).toBeGreaterThan(0);
  });

  it('keeps a frozen premiere frozen after the same cycle', () => {
    const store = createPremiereStore({ freezeAt: 12.5 });

    storeSceneApi(store).dispose();
    store.getState().advance(0.5);

    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().currentTime).toBe(12.5);
  });

  it('keeps every user setting across the cycle', () => {
    const store = createPremiereStore();
    const api = storeSceneApi(store);
    api.setNitrateMode(true);
    api.updateHeroTitle({ ...DEFAULT_HERO_TITLE, mainTitle: 'DAISY' });

    api.dispose();

    expect(store.getState().isNitrateForced).toBe(true);
    expect(store.getState().heroConfig.mainTitle).toBe('DAISY');
  });
});
