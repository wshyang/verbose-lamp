import { describe, expect, it } from 'vitest';
import { SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import {
  CHAPTER_JUMP_OFFSET,
  createPremiereStore,
  storeSceneApi,
  type PremiereStoreApi,
} from './premiereStore';

function storeWithTime(time: number): PremiereStoreApi {
  const store = createPremiereStore();
  store.getState().setTime(time);
  return store;
}

describe('createPremiereStore', () => {
  it('starts at the beginning, playing, in cinema mode', () => {
    const state = createPremiereStore().getState();
    expect(state.currentTime).toBe(0);
    expect(state.isPlaying).toBe(true);
    expect(state.cameraMode).toBe('cinema');
    expect(state.isNitrateForced).toBe(false);
    expect(state.isBorderEnabled).toBe(false);
    expect(state.activeChapterIndex).toBe(0);
    expect(state.orbitFocus).toBeNull();
  });

  it('honours the freeze affordance', () => {
    const state = createPremiereStore({ freezeAt: 11.28 }).getState();
    expect(state.currentTime).toBe(11.28);
    expect(state.isPlaying).toBe(false);
    expect(state.freezeAt).toBe(11.28);
    expect(state.activeChapterIndex).toBe(1);
  });

  it('clamps the playhead to the sequence', () => {
    const store = createPremiereStore();
    store.getState().setTime(-5);
    expect(store.getState().currentTime).toBe(0);
    store.getState().setTime(TOTAL_SEQUENCE_DURATION + 10);
    expect(store.getState().currentTime).toBeCloseTo(TOTAL_SEQUENCE_DURATION - 0.001, 10);
  });

  it('toggles playback and reports the new value', () => {
    const store = createPremiereStore();
    expect(store.getState().togglePlaying()).toBe(false);
    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().togglePlaying()).toBe(true);
    store.getState().setPlaying(false);
    expect(store.getState().isPlaying).toBe(false);
  });

  it('jumps just past a chapter start and records the active chapter', () => {
    const store = createPremiereStore();
    store.getState().jumpToChapter(2);
    const chapter = SEQUENCE_CHAPTERS[2];
    expect(store.getState().currentTime).toBe(chapter.startTime + CHAPTER_JUMP_OFFSET);
    expect(store.getState().activeChapterIndex).toBe(2);
  });

  it('clamps a jump index into range', () => {
    const store = createPremiereStore();
    store.getState().jumpToChapter(99);
    expect(store.getState().activeChapterIndex).toBe(SEQUENCE_CHAPTERS.length - 1);
    store.getState().jumpToChapter(-4);
    expect(store.getState().activeChapterIndex).toBe(0);
  });

  it('focuses the hold when orbit mode is switched on mid-flight', () => {
    const store = storeWithTime(0.1);
    store.getState().setCameraMode('orbit');
    const state = store.getState();
    expect(state.cameraMode).toBe('orbit');
    expect(state.orbitFocus?.chapterIndex).toBe(0);
    expect(state.orbitFocus?.nonce).toBe(1);
    expect(state.isPlaying).toBe(false);
  });

  it('does not move the playhead when orbit is entered during the hold', () => {
    const store = storeWithTime(4.32);
    store.getState().setCameraMode('orbit');
    expect(store.getState().currentTime).toBe(4.32);
    expect(store.getState().isPlaying).toBe(true);
  });

  it('bumps the focus nonce on every orbit jump', () => {
    const store = createPremiereStore();
    store.getState().setCameraMode('orbit');
    store.getState().jumpToChapter(3);
    store.getState().jumpToChapter(4);
    expect(store.getState().orbitFocus).toEqual({ chapterIndex: 4, nonce: 3 });
  });

  it('leaves the playhead alone when jumping in cinema mode', () => {
    const store = createPremiereStore();
    store.getState().jumpToChapter(1);
    expect(store.getState().orbitFocus).toBeNull();
  });

  it('clamps frame and border styles on the way in', () => {
    const store = createPremiereStore();
    store.getState().setSequenceFrameStyle({
      intricacy: 3,
      formula: { ...store.getState().frameStyle.formula, level: 9 },
    });
    expect(store.getState().frameStyle.intricacy).toBe(1);
    expect(store.getState().frameStyle.formula.level).toBe(4);

    store.getState().setScreenBorderStyle({ weight: 5, genome: store.getState().borderStyle.genome });
    expect(store.getState().borderStyle.weight).toBe(1);
  });

  it('stores the hero title, nitrate flag and border switch', () => {
    const store = createPremiereStore();
    const hero = { ...store.getState().heroConfig, mainTitle: 'CARRAWAY' };
    store.getState().setHeroConfig(hero);
    expect(store.getState().heroConfig.mainTitle).toBe('CARRAWAY');
    // A copy, so later mutations by the caller cannot reach the scene.
    hero.mainTitle = 'MUTATED';
    expect(store.getState().heroConfig.mainTitle).toBe('CARRAWAY');

    store.getState().setNitrateMode(true);
    expect(store.getState().isNitrateForced).toBe(true);

    store.getState().setScreenBorderEnabled(true);
    expect(store.getState().isBorderEnabled).toBe(true);
  });
});

describe('storeSceneApi', () => {
  it('satisfies PremiereSceneApi for every transport control', () => {
    const store = createPremiereStore();
    const api = storeSceneApi(store);

    api.updateHeroTitle({ ...store.getState().heroConfig, mainTitle: 'BUCHANAN' });
    expect(store.getState().heroConfig.mainTitle).toBe('BUCHANAN');

    api.setTime(12.5);
    expect(store.getState().currentTime).toBe(12.5);

    expect(api.togglePlaying()).toBe(false);
    api.setPlaying(true);
    expect(store.getState().isPlaying).toBe(true);

    api.jumpToChapter(3);
    expect(store.getState().activeChapterIndex).toBe(3);

    api.setNitrateMode(true);
    expect(store.getState().isNitrateForced).toBe(true);

    api.setSequenceFrameStyle(store.getState().frameStyle);
    api.setScreenBorderStyle(store.getState().borderStyle);
    api.setScreenBorderEnabled(true);
    expect(store.getState().isBorderEnabled).toBe(true);

    api.setCameraMode('orbit');
    expect(store.getState().cameraMode).toBe('orbit');
    api.setCameraMode('cinema');
    expect(store.getState().cameraMode).toBe('cinema');
  });
});
