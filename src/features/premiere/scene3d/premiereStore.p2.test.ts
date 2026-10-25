// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { SIGNATURE_GENOME, type FrameStyle } from '@/features/art-deco-frame';
import { createPremiereStore } from './premiereStore';
import { storeSceneApi } from './storeSceneApi';

const wildStyle = (): FrameStyle => ({
  intricacy: 4,
  formula: {
    source: 'lattice',
    level: 9.6,
    seed: 77,
    genome: { ...SIGNATURE_GENOME, cornerScale: 99 },
    layers: [{ source: 'lattice', enabled: true, level: -2.2 }],
  },
});
describe('createPremiereStore', () => {
  it('starts playing at zero in cinema mode, or frozen and paused', () => {
    const live = createPremiereStore({ freezeAt: null }).getState();
    expect(live.currentTime).toBe(0);
    expect(live.isPlaying).toBe(true);
    expect(live.cameraMode).toBe('cinema');
    const frozen = createPremiereStore({ freezeAt: 4.32 }).getState();
    expect(frozen.currentTime).toBe(4.32);
    expect(frozen.isPlaying).toBe(false);
    expect(frozen.freezeAt).toBe(4.32);
  });

  it('clamps time and chapter jumps land 0.15s into the chapter', () => {
    const store = createPremiereStore({ freezeAt: null });
    store.getState().setTime(999);
    expect(store.getState().currentTime).toBeCloseTo(37.999);
    store.getState().setTime(-4);
    expect(store.getState().currentTime).toBe(0);
    store.getState().jumpToChapter(2);
    expect(store.getState().currentTime).toBeCloseTo(14.15);
    store.getState().jumpToChapter(99);
    expect(store.getState().currentTime).toBeCloseTo(27.65);
  });

  it('orbit focus advances into the hold and pauses outside it', () => {
    const store = createPremiereStore({ freezeAt: null });
    store.getState().setTime(7.3);
    store.getState().setCameraMode('orbit');
    expect(store.getState().cameraMode).toBe('orbit');
    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().currentTime).toBeCloseTo(7.2 + 6.8 * 0.56);
    store.getState().setCameraMode('cinema');
    expect(store.getState().cameraMode).toBe('cinema');
  });

  it('orbit focus inside the hold window leaves playback untouched', () => {
    const store = createPremiereStore({ freezeAt: null });
    // Chapter II spans 7.2..14.0; 10.6 is local 0.5, inside the 0.42..0.85 hold.
    store.getState().setTime(10.6);
    store.getState().setCameraMode('orbit');
    expect(store.getState().cameraMode).toBe('orbit');
    expect(store.getState().currentTime).toBeCloseTo(10.6);
    expect(store.getState().isPlaying).toBe(true);
  });

  it('jumping chapters in orbit refocuses the clamped chapter', () => {
    const store = createPremiereStore({ freezeAt: null });
    store.getState().setCameraMode('orbit');
    store.getState().jumpToChapter(99);
    expect(store.getState().cameraMode).toBe('orbit');
    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().currentTime).toBeGreaterThan(27.65);
  });
});
describe('storeSceneApi', () => {
  it('delegates the full PremiereSceneApi surface to the store', () => {
    const store = createPremiereStore({ freezeAt: null });
    const api = storeSceneApi(store);
    api.setTime(3);
    expect(store.getState().currentTime).toBe(3);
    expect(api.togglePlaying()).toBe(false);
    api.setPlaying(true);
    api.jumpToChapter(1);
    api.setCameraMode('cinema');
    api.setNitrateMode(true);
    api.updateHeroTitle({
      keystone: 'THE', preTitle: 'GREAT', mainTitle: 'TEST', subCredit: 'X', pinstripeAlternation: true,
    });
    api.setSequenceFrameStyle(wildStyle());
    api.setScreenBorderStyle({ weight: 0.25, genome: SIGNATURE_GENOME });
    api.setScreenBorderEnabled(true);
    expect(store.getState().heroConfig.mainTitle).toBe('TEST');
    expect(store.getState().isBorderEnabled).toBe(true);
  });
});
