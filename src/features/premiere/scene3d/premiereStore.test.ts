import { describe, expect, it } from 'vitest';
import { DEFAULT_FRAME_STYLE, DEFAULT_SCREEN_BORDER_STYLE, SIGNATURE_GENOME } from '@/features/art-deco-frame';
import { DEFAULT_HERO_TITLE, SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { CHAPTER_JUMP_OFFSET, clampSequenceTime } from '../scene/styleClamp';
import { createPremiereStore } from './premiereStore';

/**
 * Every action the store exposes (ADDENDUM-022 §6 step 2.1). The transport, the scene
 * options and Frame Studio all end up here through `storeSceneApi`, so a regression in
 * this file is a regression in every control on the stage.
 */
describe('createPremiereStore defaults', () => {
  it('starts at the top of the film, playing, in cinema mode, borders off', () => {
    const store = createPremiereStore();

    expect(store.getState().currentTime).toBe(0);
    expect(store.getState().isPlaying).toBe(true);
    expect(store.getState().cameraMode).toBe('cinema');
    expect(store.getState().isNitrateForced).toBe(false);
    expect(store.getState().isBorderEnabled).toBe(false);
    expect(store.getState().freezeAt).toBeNull();
    expect(store.getState().heroConfig).toEqual(DEFAULT_HERO_TITLE);
    expect(store.getState().frameStyle).toEqual(DEFAULT_FRAME_STYLE);
    expect(store.getState().screenBorderStyle).toEqual({
      ...DEFAULT_SCREEN_BORDER_STYLE,
      pattern: 'poster',
      seed: 1925,
    });
  });

  it('freezes at the requested second and stops playing', () => {
    const store = createPremiereStore({ freezeAt: 12.5 });

    expect(store.getState().currentTime).toBe(12.5);
    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().freezeAt).toBe(12.5);
  });

  it('clamps a frozen time into the film', () => {
    expect(createPremiereStore({ freezeAt: 999 }).getState().currentTime).toBe(clampSequenceTime(999));
  });

  it('takes a seed hero title and frame style from the caller', () => {
    const store = createPremiereStore({ heroConfig: { ...DEFAULT_HERO_TITLE, mainTitle: 'DAISY' } });

    expect(store.getState().heroConfig.mainTitle).toBe('DAISY');
  });
});

describe('playback actions', () => {
  it('clamps setTime and reports the toggle result', () => {
    const store = createPremiereStore();

    store.getState().setTime(-2);
    expect(store.getState().currentTime).toBe(0);

    store.getState().setTime(999);
    expect(store.getState().currentTime).toBeLessThan(TOTAL_SEQUENCE_DURATION);

    expect(store.getState().togglePlaying()).toBe(false);
    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().togglePlaying()).toBe(true);

    store.getState().setPlaying(false);
    expect(store.getState().isPlaying).toBe(false);
  });

  it('advances only while playing and not frozen', () => {
    const running = createPremiereStore();
    running.getState().advance(0.02);
    expect(running.getState().currentTime).toBeCloseTo(0.02, 9);
    expect(running.getState().elapsed).toBeCloseTo(0.02, 9);

    running.getState().setPlaying(false);
    running.getState().advance(0.02);
    expect(running.getState().currentTime).toBeCloseTo(0.02, 9);
    // The ambient clock keeps running while paused: the dust and searchlights move.
    expect(running.getState().elapsed).toBeCloseTo(0.04, 9);

    const frozen = createPremiereStore({ freezeAt: 5 });
    frozen.getState().advance(1);
    expect(frozen.getState().currentTime).toBe(5);
    expect(frozen.getState().elapsed).toBe(5);
  });

  it('jumps to a chapter 0.15 s in and clamps the index', () => {
    const store = createPremiereStore();

    store.getState().jumpToChapter(2);
    expect(store.getState().currentTime).toBeCloseTo(SEQUENCE_CHAPTERS[2].startTime + CHAPTER_JUMP_OFFSET, 9);
    expect(store.getState().orbitTargetChapter).toBe(2);

    store.getState().jumpToChapter(-5);
    expect(store.getState().currentTime).toBeCloseTo(CHAPTER_JUMP_OFFSET, 9);
    expect(store.getState().orbitTargetChapter).toBe(0);
  });
});

describe('orbit hand-off', () => {
  it('bumps the nonce when orbiting starts, so the camera can react', () => {
    const store = createPremiereStore();
    store.getState().setTime(8.5);

    store.getState().setCameraMode('orbit');

    expect(store.getState().cameraMode).toBe('orbit');
    expect(store.getState().orbitFocusNonce).toBe(1);
    expect(store.getState().orbitTargetChapter).toBe(1);

    store.getState().setCameraMode('cinema');
    expect(store.getState().orbitFocusNonce).toBe(1);

    store.getState().setCameraMode('orbit');
    expect(store.getState().orbitFocusNonce).toBe(2);
  });

  it('only re-focuses a chapter jump when the guest is already orbiting', () => {
    const store = createPremiereStore();

    store.getState().jumpToChapter(3);
    expect(store.getState().orbitFocusNonce).toBe(0);

    store.getState().setCameraMode('orbit');
    store.getState().jumpToChapter(3);
    expect(store.getState().orbitFocusNonce).toBe(2);
  });
});

describe('surface styles', () => {
  it('clamps a frame style and bumps the version once per change', () => {
    const store = createPremiereStore();

    store.getState().setFrameStyle({
      intricacy: 8,
      formula: { source: 'fractal', level: 9, genome: { ...SIGNATURE_GENOME } },
    });

    expect(store.getState().frameStyle.intricacy).toBe(1);
    expect(store.getState().frameStyle.formula.level).toBe(4);
    expect(store.getState().frameStyleVersion).toBe(1);
  });

  it('keeps the lattice proscenium pattern and seed on the screen border', () => {
    const store = createPremiereStore();

    store.getState().setScreenBorderStyle({ ...DEFAULT_SCREEN_BORDER_STYLE, pattern: 'lattice', seed: 8, weight: 4 });
    expect(store.getState().screenBorderStyle).toEqual({
      weight: 1,
      genome: SIGNATURE_GENOME,
      pattern: 'lattice',
      seed: 8,
    });
    expect(store.getState().frameStyleVersion).toBe(1);

    store.getState().setScreenBorderEnabled(true);
    expect(store.getState().isBorderEnabled).toBe(true);
  });

  it('takes the manual nitrate flag and the hero title', () => {
    const store = createPremiereStore();

    store.getState().setNitrateMode(true);
    expect(store.getState().isNitrateForced).toBe(true);

    store.getState().setHeroTitle({ ...DEFAULT_HERO_TITLE, subCredit: 'A LUHrmann FILM' });
    expect(store.getState().heroConfig.subCredit).toBe('A LUHrmann FILM');
    // A copy, not the caller's object: a later mutation must not reach the scene.
    expect(store.getState().heroConfig).not.toBe(DEFAULT_HERO_TITLE);
  });
});
