import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FRAME_STYLE,
  DEFAULT_SCREEN_BORDER_STYLE,
  SIGNATURE_GENOME,
} from '@/features/art-deco-frame';
import { DEFAULT_HERO_TITLE, SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { createPremiereStore } from './premiereStore';

const chapter = (index: number) => SEQUENCE_CHAPTERS[index];
const holdTime = (index: number) =>
  chapter(index).startTime + (chapter(index).endTime - chapter(index).startTime) * 0.56;

describe('createPremiereStore: initial state', () => {
  it('starts a live visit playing from the top in cinema mode', () => {
    const state = createPremiereStore().getState();

    expect(state.currentTime).toBe(0);
    expect(state.elapsed).toBe(0);
    expect(state.isPlaying).toBe(true);
    expect(state.cameraMode).toBe('cinema');
    expect(state.isNitrateForced).toBe(false);
    expect(state.isBorderEnabled).toBe(false);
    expect(state.freezeAt).toBeNull();
    expect(state.orbitFocus).toBeNull();
    expect(state.frameStyleVersion).toBe(0);
  });

  it('starts from the default title, frame style and screen border, by value', () => {
    const state = createPremiereStore().getState();

    expect(state.heroConfig).toEqual(DEFAULT_HERO_TITLE);
    expect(state.frameStyle.intricacy).toBe(DEFAULT_FRAME_STYLE.intricacy);
    expect(state.frameStyle.formula.source).toBe(DEFAULT_FRAME_STYLE.formula.source);
    expect(state.frameStyle.formula.genome).toEqual(DEFAULT_FRAME_STYLE.formula.genome);
    expect(state.borderStyle.weight).toBe(DEFAULT_SCREEN_BORDER_STYLE.weight);
    expect(state.borderStyle.genome).toEqual(DEFAULT_SCREEN_BORDER_STYLE.genome);
  });

  it('starts a frozen visit paused at the frozen time, with the shader clock there too', () => {
    const state = createPremiereStore({ freezeAt: 12.5 }).getState();

    expect(state.freezeAt).toBe(12.5);
    expect(state.currentTime).toBe(12.5);
    expect(state.elapsed).toBe(12.5);
    expect(state.isPlaying).toBe(false);
  });

  it('keeps a frozen time inside the sequence', () => {
    expect(createPremiereStore({ freezeAt: 999 }).getState().currentTime).toBeCloseTo(37.999, 9);
    expect(createPremiereStore({ freezeAt: -4 }).getState().currentTime).toBe(0);
  });

  it('accepts a frozen time of exactly zero as frozen, not as a live visit', () => {
    const state = createPremiereStore({ freezeAt: 0 }).getState();

    expect(state.freezeAt).toBe(0);
    expect(state.isPlaying).toBe(false);
  });

  it('seeds every configurable field from the options, clamped', () => {
    const state = createPremiereStore({
      heroConfig: { ...DEFAULT_HERO_TITLE, mainTitle: 'JAZZ' },
      frameStyle: { ...DEFAULT_FRAME_STYLE, intricacy: 9 },
      screenBorderStyle: { ...DEFAULT_SCREEN_BORDER_STYLE, weight: -2 },
      isBorderEnabled: true,
    }).getState();

    expect(state.heroConfig.mainTitle).toBe('JAZZ');
    expect(state.frameStyle.intricacy).toBe(1);
    expect(state.borderStyle.weight).toBe(0);
    expect(state.isBorderEnabled).toBe(true);
  });

  // The default genome is a shared constant. A store that aliased it would let one store's
  // edit (or one test's) rewrite the default for every other store and the next visit.
  it('never aliases the shared default genomes', () => {
    const first = createPremiereStore().getState();
    const snapshot = { ...SIGNATURE_GENOME };

    (first.frameStyle.formula.genome as { cornerScale: number }).cornerScale = 123;
    (first.borderStyle.genome as { cornerScale: number }).cornerScale = 456;

    expect(DEFAULT_FRAME_STYLE.formula.genome).toEqual(snapshot);
    expect(DEFAULT_SCREEN_BORDER_STYLE.genome).toEqual(snapshot);
    expect(SIGNATURE_GENOME).toEqual(snapshot);
    expect(createPremiereStore().getState().frameStyle.formula.genome).toEqual(snapshot);
  });

  it('gives two stores independent state', () => {
    const a = createPremiereStore();
    const b = createPremiereStore();

    a.getState().setTime(20);

    expect(b.getState().currentTime).toBe(0);
  });
});

describe('playback actions', () => {
  it('seeks, clamping to the sequence and treating NaN as the start', () => {
    const store = createPremiereStore();

    store.getState().setTime(20);
    expect(store.getState().currentTime).toBe(20);
    store.getState().setTime(-10);
    expect(store.getState().currentTime).toBe(0);
    store.getState().setTime(999);
    expect(store.getState().currentTime).toBeCloseTo(TOTAL_SEQUENCE_DURATION - 0.001, 9);
    store.getState().setTime(Number.NaN);
    expect(store.getState().currentTime).toBe(0);
  });

  it('sets playback and reports the state a toggle applied', () => {
    const store = createPremiereStore();

    store.getState().setPlaying(false);
    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().togglePlaying()).toBe(true);
    expect(store.getState().isPlaying).toBe(true);
    expect(store.getState().togglePlaying()).toBe(false);
    expect(store.getState().isPlaying).toBe(false);
  });

  it('jumps just inside a chapter, clamping the index', () => {
    const store = createPremiereStore();

    store.getState().jumpToChapter(2);
    expect(store.getState().currentTime).toBeCloseTo(chapter(2).startTime + 0.15, 9);
    store.getState().jumpToChapter(-5);
    expect(store.getState().currentTime).toBeCloseTo(0.15, 9);
    store.getState().jumpToChapter(99);
    expect(store.getState().currentTime).toBeCloseTo(chapter(4).startTime + 0.15, 9);
    store.getState().jumpToChapter(Number.NaN);
    expect(store.getState().currentTime).toBeCloseTo(0.15, 9);
  });

  it('does not touch the orbit camera when jumping in cinema mode', () => {
    const store = createPremiereStore();

    store.getState().jumpToChapter(3);

    expect(store.getState().orbitFocus).toBeNull();
    expect(store.getState().isPlaying).toBe(true);
  });
});

describe('active chapter', () => {
  it('starts on the chapter that owns the starting time', () => {
    expect(createPremiereStore().getState().activeChapterIndex).toBe(0);
    expect(createPremiereStore({ freezeAt: chapter(3).startTime + 1 }).getState().activeChapterIndex).toBe(3);
  });

  it('records the chapter the scene reports and follows a jump', () => {
    const store = createPremiereStore();

    store.getState().setActiveChapterIndex(2);
    expect(store.getState().activeChapterIndex).toBe(2);
    store.getState().jumpToChapter(4);
    expect(store.getState().activeChapterIndex).toBe(4);
  });
});

describe('camera actions', () => {
  it('focuses the orbit camera on the active chapter and moves into the hold', () => {
    const store = createPremiereStore();
    store.getState().setTime(chapter(1).startTime + 0.2);

    store.getState().setCameraMode('orbit');

    const state = store.getState();
    expect(state.cameraMode).toBe('orbit');
    expect(state.orbitFocus).toEqual({ chapterIndex: 1, nonce: 1 });
    expect(state.currentTime).toBeCloseTo(holdTime(1), 9);
    expect(state.isPlaying).toBe(false);
  });

  it('leaves the playhead and playback alone when orbiting from inside the hold', () => {
    const store = createPremiereStore();
    store.getState().setTime(holdTime(2));

    store.getState().setCameraMode('orbit');

    const state = store.getState();
    expect(state.currentTime).toBeCloseTo(holdTime(2), 9);
    expect(state.isPlaying).toBe(true);
    expect(state.orbitFocus).toEqual({ chapterIndex: 2, nonce: 1 });
  });

  it('counts every orbit snap so the camera re-applies even to the same chapter', () => {
    const store = createPremiereStore();
    store.getState().setTime(holdTime(2));

    store.getState().setCameraMode('orbit');
    store.getState().focusOrbit(2);
    store.getState().focusOrbit(2);

    expect(store.getState().orbitFocus).toEqual({ chapterIndex: 2, nonce: 3 });
  });

  it('snaps to the jumped-to chapter when jumping in orbit mode', () => {
    const store = createPremiereStore();
    store.getState().setTime(holdTime(0));
    store.getState().setCameraMode('orbit');

    store.getState().jumpToChapter(3);

    const state = store.getState();
    expect(state.orbitFocus?.chapterIndex).toBe(3);
    expect(state.currentTime).toBeCloseTo(holdTime(3), 9);
    expect(state.isPlaying).toBe(false);
  });

  it('returns to cinema without a new orbit request', () => {
    const store = createPremiereStore();
    store.getState().setCameraMode('orbit');
    const before = store.getState().orbitFocus;

    store.getState().setCameraMode('cinema');

    expect(store.getState().cameraMode).toBe('cinema');
    expect(store.getState().orbitFocus).toEqual(before);
  });
});

describe('style actions', () => {
  it('toggles the forced 1920s look', () => {
    const store = createPremiereStore();

    store.getState().setNitrateMode(true);
    expect(store.getState().isNitrateForced).toBe(true);
    store.getState().setNitrateMode(false);
    expect(store.getState().isNitrateForced).toBe(false);
  });

  it('keeps a copy of the hero title rather than the caller’s object', () => {
    const store = createPremiereStore();
    const config = { ...DEFAULT_HERO_TITLE, mainTitle: 'JAZZ' };

    store.getState().setHeroConfig(config);
    config.mainTitle = 'MUTATED';

    expect(store.getState().heroConfig.mainTitle).toBe('JAZZ');
  });

  it('clamps the frame style and counts each change so cards rebuild once per frame', () => {
    const store = createPremiereStore();

    store.getState().setSequenceFrameStyle({
      ...DEFAULT_FRAME_STYLE,
      intricacy: 7,
      formula: { ...DEFAULT_FRAME_STYLE.formula, level: 99 },
    });

    expect(store.getState().frameStyle.intricacy).toBe(1);
    expect(store.getState().frameStyle.formula.level).toBe(4);
    expect(store.getState().frameStyleVersion).toBe(1);
    store.getState().setSequenceFrameStyle(DEFAULT_FRAME_STYLE);
    expect(store.getState().frameStyleVersion).toBe(2);
  });

  // The shipped manager rebuilt the title cards for a frame-style change only; the border
  // rig took its own style. A border change must not cost a card rebuild.
  it('clamps the screen border without bumping the card rebuild counter', () => {
    const store = createPremiereStore();

    store.getState().setScreenBorderStyle({ ...DEFAULT_SCREEN_BORDER_STYLE, weight: 5 });

    expect(store.getState().borderStyle.weight).toBe(1);
    expect(store.getState().frameStyleVersion).toBe(0);
  });

  it('enables and disables the screen border', () => {
    const store = createPremiereStore();

    store.getState().setScreenBorderEnabled(true);
    expect(store.getState().isBorderEnabled).toBe(true);
    store.getState().setScreenBorderEnabled(false);
    expect(store.getState().isBorderEnabled).toBe(false);
  });
});

describe('advance', () => {
  it('moves the film and the shader clock while playing', () => {
    const store = createPremiereStore();

    store.getState().advance(0.016);

    expect(store.getState().currentTime).toBeCloseTo(0.016, 12);
    expect(store.getState().elapsed).toBeCloseTo(0.016, 12);
  });

  it('caps a stalled frame for the film but not for the shader clock', () => {
    const store = createPremiereStore();

    store.getState().advance(1.5);

    expect(store.getState().currentTime).toBeCloseTo(0.05, 12);
    expect(store.getState().elapsed).toBeCloseTo(1.5, 12);
  });

  it('holds the film while paused but keeps the shaders moving', () => {
    const store = createPremiereStore();
    store.getState().setPlaying(false);

    store.getState().advance(0.1);

    expect(store.getState().currentTime).toBe(0);
    expect(store.getState().elapsed).toBeCloseTo(0.1, 12);
  });

  it('pins both clocks on a frozen frame, even after a seek', () => {
    const store = createPremiereStore({ freezeAt: 12.5 });

    store.getState().advance(0.1);
    store.getState().setTime(20);
    store.getState().advance(0.1);

    expect(store.getState().currentTime).toBe(20);
    expect(store.getState().elapsed).toBe(12.5);
  });

  it('wraps to the very start at the end of the film', () => {
    const store = createPremiereStore();
    store.getState().setTime(TOTAL_SEQUENCE_DURATION - 0.02);

    store.getState().advance(0.05);

    expect(store.getState().currentTime).toBe(0);
  });

  it('reads a NaN frame delta as no time passing', () => {
    const store = createPremiereStore();

    store.getState().advance(Number.NaN);

    expect(store.getState().currentTime).toBe(0);
    expect(store.getState().elapsed).toBe(0);
  });
});

describe('subscriptions', () => {
  it('notifies a subscriber when state changes, and not after it unsubscribes', () => {
    const store = createPremiereStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.getState().setTime(5);
    unsubscribe();
    store.getState().setTime(6);

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
