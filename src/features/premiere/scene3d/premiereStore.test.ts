import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_FRAME_STYLE, DEFAULT_SCREEN_BORDER_STYLE, SIGNATURE_GENOME } from '@/features/art-deco-frame';
import { DEFAULT_HERO_TITLE, SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { createPremiereStore, storeSceneApi } from './premiereStore';

describe('createPremiereStore', () => {
  it('starts at zero, playing, directed and undecorated', () => {
    const state = createPremiereStore().getState();
    expect(state.currentTime).toBe(0);
    expect(state.isPlaying).toBe(true);
    expect(state.cameraMode).toBe('cinema');
    expect(state.isNitrateForced).toBe(false);
    expect(state.isBorderEnabled).toBe(false);
    expect(state.freezeAt).toBeNull();
    expect(state.heroConfig).toEqual(DEFAULT_HERO_TITLE);
    expect(state.frameStyle.intricacy).toBe(DEFAULT_FRAME_STYLE.intricacy);
    expect(state.frameStyle.formula.genome).toEqual(SIGNATURE_GENOME);
    expect(state.screenBorderStyle).toEqual(DEFAULT_SCREEN_BORDER_STYLE);
  });

  it('holds a frozen frame when asked', () => {
    const state = createPremiereStore({ freezeAt: 4.32 }).getState();
    expect(state.freezeAt).toBe(4.32);
    expect(state.currentTime).toBe(4.32);
    expect(state.isPlaying).toBe(false);
  });

  it('keeps the playhead inside the sequence', () => {
    const store = createPremiereStore();
    store.getState().setTime(-4);
    expect(store.getState().currentTime).toBe(0);
    store.getState().setTime(99);
    expect(store.getState().currentTime).toBeCloseTo(TOTAL_SEQUENCE_DURATION - 0.001, 6);
  });

  it('toggles and reports playback', () => {
    const store = createPremiereStore();
    expect(store.getState().togglePlaying()).toBe(false);
    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().togglePlaying()).toBe(true);
    expect(store.getState().isPlaying).toBe(true);

    store.getState().setPlaying(false);
    expect(store.getState().isPlaying).toBe(false);
  });

  it('jumps 0.15 s into a chapter and clamps the index', () => {
    const store = createPremiereStore();
    store.getState().jumpToChapter(2);
    const chapter = SEQUENCE_CHAPTERS[2];
    expect(store.getState().currentTime).toBeCloseTo(chapter.startTime + 0.15);
    expect(store.getState().isPlaying).toBe(true);

    store.getState().jumpToChapter(-5);
    expect(store.getState().currentTime).toBeCloseTo(SEQUENCE_CHAPTERS[0].startTime + 0.15);

    store.getState().jumpToChapter(99);
    const last = SEQUENCE_CHAPTERS[SEQUENCE_CHAPTERS.length - 1];
    expect(store.getState().currentTime).toBeCloseTo(last.startTime + 0.15);
  });

  it('lands on the hold when a chapter is picked in orbit mode', () => {
    const store = createPremiereStore();
    store.getState().setCameraMode('orbit');
    store.getState().jumpToChapter(1);
    const chapter = SEQUENCE_CHAPTERS[1];
    const duration = chapter.endTime - chapter.startTime;
    expect(store.getState().currentTime).toBeCloseTo(chapter.startTime + duration * 0.56);
    expect(store.getState().isPlaying).toBe(false);
  });

  it('opens the orbit camera on the hold, and leaves the cinema playhead alone', () => {
    const store = createPremiereStore();
    store.getState().setTime(0);
    store.getState().setCameraMode('orbit');
    expect(store.getState().cameraMode).toBe('orbit');
    expect(store.getState().currentTime).toBeCloseTo(
      SEQUENCE_CHAPTERS[0].startTime +
        (SEQUENCE_CHAPTERS[0].endTime - SEQUENCE_CHAPTERS[0].startTime) * 0.56,
    );
    expect(store.getState().isPlaying).toBe(false);

    store.getState().setPlaying(true);
    store.getState().setCameraMode('cinema');
    expect(store.getState().cameraMode).toBe('cinema');
    expect(store.getState().isPlaying).toBe(true);
  });

  it('does not move a playhead that is already inside the orbit hold', () => {
    const store = createPremiereStore();
    const chapter = SEQUENCE_CHAPTERS[2];
    const inside = chapter.startTime + (chapter.endTime - chapter.startTime) * 0.6;
    store.getState().setTime(inside);
    store.getState().setCameraMode('orbit');
    expect(store.getState().currentTime).toBeCloseTo(inside);
  });

  it('clamps styles on the way in', () => {
    const store = createPremiereStore();
    store.getState().setSequenceFrameStyle({
      intricacy: 5,
      formula: {
        source: 'fractal',
        level: 9,
        genome: { ...SIGNATURE_GENOME, cornerScale: 99 },
        layers: [{ source: 'rosette', enabled: true, level: 0 }],
      },
    });
    expect(store.getState().frameStyle.intricacy).toBe(1);
    expect(store.getState().frameStyle.formula.level).toBe(4);
    expect(store.getState().frameStyle.formula.layers?.[0].level).toBe(1);

    store.getState().setScreenBorderStyle({ weight: 2, genome: { ...SIGNATURE_GENOME, wingDelta: 9 } });
    expect(store.getState().screenBorderStyle.weight).toBe(1);
    store.getState().setScreenBorderEnabled(true);
    expect(store.getState().isBorderEnabled).toBe(true);
  });

  it('copies a new hero configuration', () => {
    const store = createPremiereStore();
    const config = { ...DEFAULT_HERO_TITLE, mainTitle: 'CARRAWAY' };
    store.getState().updateHeroTitle(config);
    expect(store.getState().heroConfig).toEqual(config);
    expect(store.getState().heroConfig).not.toBe(config);
  });

  it('toggles the nitrate filter', () => {
    const store = createPremiereStore();
    store.getState().setNitrateMode(true);
    expect(store.getState().isNitrateForced).toBe(true);
  });
});

describe('storeSceneApi', () => {
  it('drives the store through the scene port', () => {
    const store = createPremiereStore();
    const api = storeSceneApi(store);

    api.setTime(6.7);
    expect(store.getState().currentTime).toBeCloseTo(6.7);

    api.setPlaying(false);
    expect(store.getState().isPlaying).toBe(false);
    expect(api.togglePlaying()).toBe(true);

    api.jumpToChapter(4);
    expect(store.getState().currentTime).toBeCloseTo(SEQUENCE_CHAPTERS[4].startTime + 0.15);

    api.setCameraMode('orbit');
    expect(store.getState().cameraMode).toBe('orbit');
    api.setCameraMode('cinema');

    api.setNitrateMode(true);
    expect(store.getState().isNitrateForced).toBe(true);

    api.setSequenceFrameStyle(DEFAULT_FRAME_STYLE);
    api.setScreenBorderStyle(DEFAULT_SCREEN_BORDER_STYLE);
    api.setScreenBorderEnabled(true);
    expect(store.getState().isBorderEnabled).toBe(true);

    api.updateHeroTitle({ ...DEFAULT_HERO_TITLE, mainTitle: 'DAISY' });
    expect(store.getState().heroConfig.mainTitle).toBe('DAISY');
  });

  it('stops the scene on dispose', () => {
    const store = createPremiereStore();
    const api = storeSceneApi(store);
    expect(store.getState().isPlaying).toBe(true);
    api.dispose();
    expect(store.getState().isPlaying).toBe(false);
  });

  it('keeps the wiring callbacks the runtime supplied', () => {
    const onTelemetry = vi.fn();
    const onChapterChange = vi.fn();
    const onFrameReady = vi.fn();
    const store = createPremiereStore({ onTelemetry, onChapterChange, onFrameReady });
    store.getState().onTelemetry?.({ currentTime: 1, activeChapterIndex: 0, isPlaying: true });
    store.getState().onChapterChange?.(2);
    store.getState().onFrameReady?.();
    expect(onTelemetry).toHaveBeenCalledTimes(1);
    expect(onChapterChange).toHaveBeenCalledWith(2);
    expect(onFrameReady).toHaveBeenCalledTimes(1);
  });
});
