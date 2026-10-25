import { describe, expect, it } from 'vitest';
import { DEFAULT_FRAME_STYLE, DEFAULT_SCREEN_BORDER_STYLE, SIGNATURE_GENOME } from '@/features/art-deco-frame';
import { DEFAULT_HERO_TITLE, SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { CHAPTER_JUMP_OFFSET } from '../scene/styleClamp';
import { createPremiereStore } from './premiereStore';
import { storeSceneApi } from './storeSceneApi';

/**
 * The adapter is what lets the transport, the scene options and Frame Studio stay
 * exactly as they are (ADDENDUM-022 §6 step 2.1). Every method must reach the store.
 */
describe('storeSceneApi', () => {
  it('implements the whole PremiereSceneApi surface over a store', () => {
    const store = createPremiereStore();
    const api = storeSceneApi(store);

    api.setTime(6);
    expect(store.getState().currentTime).toBe(6);

    api.setPlaying(false);
    expect(store.getState().isPlaying).toBe(false);
    expect(api.togglePlaying()).toBe(true);

    api.jumpToChapter(3);
    expect(store.getState().currentTime).toBeCloseTo(
      SEQUENCE_CHAPTERS[3].startTime + CHAPTER_JUMP_OFFSET,
      9
    );

    api.setCameraMode('orbit');
    expect(store.getState().cameraMode).toBe('orbit');

    api.setNitrateMode(true);
    expect(store.getState().isNitrateForced).toBe(true);

    api.updateHeroTitle({ ...DEFAULT_HERO_TITLE, mainTitle: 'DAISY' });
    expect(store.getState().heroConfig.mainTitle).toBe('DAISY');

    api.setSequenceFrameStyle({ ...DEFAULT_FRAME_STYLE, intricacy: 9 });
    expect(store.getState().frameStyle.intricacy).toBe(1);

    api.setScreenBorderStyle({ ...DEFAULT_SCREEN_BORDER_STYLE, genome: { ...SIGNATURE_GENOME }, weight: 0.9 });
    expect(store.getState().screenBorderStyle.weight).toBe(0.9);

    api.setScreenBorderEnabled(true);
    expect(store.getState().isBorderEnabled).toBe(true);
  });

  it('disposes nothing, because the Canvas owns every GPU resource', () => {
    const store = createPremiereStore();
    const before = store.getState();

    expect(() => storeSceneApi(store).dispose()).not.toThrow();
    expect(store.getState().currentTime).toBe(before.currentTime);
  });

  it('does not read the store’s state at construction time', () => {
    // The adapter is created once and handed to hooks that outlive several actions;
    // it must always act on the live state.
    const store = createPremiereStore();
    const api = storeSceneApi(store);

    store.getState().setTime(TOTAL_SEQUENCE_DURATION - 1);
    api.setPlaying(false);

    expect(store.getState().isPlaying).toBe(false);
  });

  it('reports the toggle result straight from the store, both ways', () => {
    const api = storeSceneApi(createPremiereStore());

    expect(api.togglePlaying()).toBe(false);
    expect(api.togglePlaying()).toBe(true);
  });
});
