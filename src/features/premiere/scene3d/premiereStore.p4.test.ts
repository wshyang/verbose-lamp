// From PR #4 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { createPremiereStore, type PremiereStoreApi } from './premiereStore';

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
