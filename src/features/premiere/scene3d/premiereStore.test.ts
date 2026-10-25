import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FRAME_STYLE,
  SIGNATURE_GENOME,
  type FrameStyle,
  type ScreenBorderStyle,
} from '@/features/art-deco-frame';
import { DEFAULT_HERO_TITLE } from '../data/sequence';
import { createPremiereStore, storeSceneApi } from './premiereStore';

const wildFrameStyle: FrameStyle = {
  intricacy: 5,
  formula: { source: 'lattice', level: 9, seed: -3, genome: { ...SIGNATURE_GENOME } },
};

describe('createPremiereStore', () => {
  it('starts exactly where the imperative manager starts', () => {
    const state = createPremiereStore().getState();
    expect(state.currentTime).toBe(0);
    expect(state.isPlaying).toBe(true);
    expect(state.cameraMode).toBe('cinema');
    expect(state.isNitrateForced).toBe(false);
    expect(state.isBorderEnabled).toBe(false);
    expect(state.freezeAt).toBeNull();
    expect(state.heroConfig).toEqual(DEFAULT_HERO_TITLE);
    expect(state.heroConfig).not.toBe(DEFAULT_HERO_TITLE);
    expect(state.frameStyle.intricacy).toBe(DEFAULT_FRAME_STYLE.intricacy);
    expect(state.frameStyle.formula.genome).toEqual({ ...SIGNATURE_GENOME });
    expect(state.borderStyle.weight).toBe(0.5);
    expect(state.borderStyle.pattern).toBe('poster');
  });

  it('a frozen store starts paused at the frozen second and never advances', () => {
    const store = createPremiereStore(11.28);
    expect(store.getState().currentTime).toBe(11.28);
    expect(store.getState().isPlaying).toBe(false);
    store.getState().advanceBy(1);
    store.getState().setPlaying(true);
    store.getState().advanceBy(1);
    expect(store.getState().currentTime).toBe(11.28);
  });

  it('advances while playing and wraps to zero at the end, like the manager loop', () => {
    const store = createPremiereStore();
    store.getState().advanceBy(0.5);
    expect(store.getState().currentTime).toBe(0.5);
    store.getState().setPlaying(false);
    store.getState().advanceBy(1);
    expect(store.getState().currentTime).toBe(0.5);
    store.getState().setPlaying(true);
    store.getState().setTime(37.99);
    store.getState().advanceBy(0.05);
    expect(store.getState().currentTime).toBe(0);
  });

  it('clamps setTime into the sequence', () => {
    const store = createPremiereStore();
    store.getState().setTime(-1);
    expect(store.getState().currentTime).toBe(0);
    store.getState().setTime(99);
    expect(store.getState().currentTime).toBeCloseTo(37.999, 10);
  });

  it('togglePlaying flips and returns the new value', () => {
    const store = createPremiereStore();
    expect(store.getState().togglePlaying()).toBe(false);
    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().togglePlaying()).toBe(true);
  });

  it('jumps land 0.15 s into the clamped chapter', () => {
    const store = createPremiereStore();
    store.getState().jumpToChapter(2);
    expect(store.getState().currentTime).toBe(14.15);
    store.getState().jumpToChapter(-1);
    expect(store.getState().currentTime).toBe(0.15);
    store.getState().jumpToChapter(99);
    expect(store.getState().currentTime).toBe(27.65);
  });

  it('style setters clamp before storing', () => {
    const store = createPremiereStore();
    store.getState().setSequenceFrameStyle(wildFrameStyle);
    expect(store.getState().frameStyle.intricacy).toBe(1);
    expect(store.getState().frameStyle.formula.level).toBe(4);
    expect(store.getState().frameStyle.formula.seed).toBe(0);
    const border: ScreenBorderStyle = {
      weight: -2,
      genome: { ...SIGNATURE_GENOME },
      pattern: 'lattice',
    };
    store.getState().setScreenBorderStyle(border);
    expect(store.getState().borderStyle.weight).toBe(0);
    expect(store.getState().borderStyle.pattern).toBe('lattice');
  });

  it('stores its own copy of the hero config', () => {
    const store = createPremiereStore();
    const config = { ...DEFAULT_HERO_TITLE, mainTitle: 'DAISY' };
    store.getState().updateHeroTitle(config);
    config.mainTitle = 'MUTATED';
    expect(store.getState().heroConfig.mainTitle).toBe('DAISY');
  });
});

describe('storeSceneApi', () => {
  it('drives the store through the full PremiereSceneApi surface', () => {
    const store = createPremiereStore();
    const api = storeSceneApi(store);

    api.setTime(30);
    expect(store.getState().currentTime).toBe(30);
    api.jumpToChapter(4);
    expect(store.getState().currentTime).toBe(27.65);
    api.setPlaying(false);
    expect(api.togglePlaying()).toBe(true);
    api.setCameraMode('orbit');
    expect(store.getState().cameraMode).toBe('orbit');
    api.setNitrateMode(true);
    expect(store.getState().isNitrateForced).toBe(true);
    api.updateHeroTitle({ ...DEFAULT_HERO_TITLE, mainTitle: 'DAISY' });
    expect(store.getState().heroConfig.mainTitle).toBe('DAISY');
    api.setSequenceFrameStyle(wildFrameStyle);
    expect(store.getState().frameStyle.intricacy).toBe(1);
    api.setScreenBorderStyle({ weight: 0.25, genome: { ...SIGNATURE_GENOME } });
    expect(store.getState().borderStyle.weight).toBe(0.25);
    api.setScreenBorderEnabled(true);
    expect(store.getState().isBorderEnabled).toBe(true);
    expect(() => api.dispose()).not.toThrow();
  });
});
