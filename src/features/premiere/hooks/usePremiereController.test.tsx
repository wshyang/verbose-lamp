// @vitest-environment jsdom
import { act, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The audio engine needs browser audio, so it is doubled at its module seam. Everything else is
// real: the controller runs on the real runtime hook and the real store, so these tests pin what
// a user of the premiere can observe through it (transport, options, title, telemetry).
const doubles = vi.hoisted(() => ({ audio: [] as Array<{ shimmers: number[]; soundOn: boolean }> }));

vi.mock('../audio/cinemaAudio', () => ({
  CinemaAudioEngine: class {
    record = { shimmers: [] as number[], soundOn: false };
    constructor() {
      doubles.audio.push(this.record);
    }
    triggerActShimmer(index: number) {
      this.record.shimmers.push(index);
    }
    toggle() {
      this.record.soundOn = !this.record.soundOn;
      return this.record.soundOn;
    }
    dispose() {}
  },
}));

import { DEFAULT_HERO_TITLE, SEQUENCE_CHAPTERS } from '../data/sequence';
import { chapterJumpTarget } from '../scene/styleClamp';
import { usePremiereController } from './usePremiereController';

type Controller = ReturnType<typeof usePremiereController>;

/** Mounts the controller the way the page does: the stage element exists in the first commit. */
function setup(search = '') {
  window.history.replaceState(null, '', `/${search}`);
  const captured: { current: Controller | null } = { current: null };
  function Host() {
    const controller = usePremiereController();
    captured.current = controller;
    return <div ref={controller.stageRef} />;
  }
  const view = render(<Host />);
  return {
    ...view,
    result: captured as { current: Controller },
    store: () => captured.current!.runtime.store.getState(),
  };
}

const telemetry = (currentTime: number, isPlaying = true) => ({ currentTime, activeChapterIndex: 0, isPlaying });

beforeEach(() => vi.spyOn(performance, 'now').mockReturnValue(1000));
afterEach(() => {
  vi.restoreAllMocks();
  doubles.audio.length = 0;
  window.history.replaceState(null, '', '/');
});

describe('usePremiereController: opening state', () => {
  it('opens playing at the top of the first act, in cinema mode, silent, with the delivered title', () => {
    const { result } = setup();

    expect(result.current).toMatchObject({
      currentTime: 0,
      activeAct: 0,
      isPlaying: true,
      cameraMode: 'cinema',
      nitrateMode: false,
      soundOn: false,
      heroConfig: DEFAULT_HERO_TITLE,
    });
    expect(result.current.currentChapter).toBe(SEQUENCE_CHAPTERS[0]);
  });

  it('exposes the scene getter and the runtime the stage mounts', () => {
    const { result } = setup();

    expect(result.current.getSceneApi()).not.toBeNull();
    expect(typeof result.current.runtime.onSceneTelemetry).toBe('function');
    expect(result.current.stageRef).toBeDefined();
  });

  it('copies the delivered title rather than sharing it', () => {
    const { result } = setup();

    expect(result.current.heroConfig).not.toBe(DEFAULT_HERO_TITLE);
  });
});

describe('usePremiereController: telemetry', () => {
  it('shows the time and play state the scene reports', () => {
    const { result } = setup();

    act(() => result.current.runtime.onSceneTelemetry(telemetry(5.5, false)));

    expect(result.current.currentTime).toBe(5.5);
    expect(result.current.isPlaying).toBe(false);
  });

  it('shows at most one update per 48 ms, so a 60 Hz scene does not re-render the page every frame', () => {
    const now = vi.spyOn(performance, 'now');
    const { result } = setup();

    now.mockReturnValue(2000);
    act(() => result.current.runtime.onSceneTelemetry(telemetry(1)));
    now.mockReturnValue(2048);
    act(() => result.current.runtime.onSceneTelemetry(telemetry(2)));
    expect(result.current.currentTime).toBe(1);

    now.mockReturnValue(2049);
    act(() => result.current.runtime.onSceneTelemetry(telemetry(3)));
    expect(result.current.currentTime).toBe(3);
  });

  it('follows the act the scene moves into, and shows that act', () => {
    const { result } = setup();

    act(() => result.current.runtime.onSceneChapterChange(3));

    expect(result.current.activeAct).toBe(3);
    expect(result.current.currentChapter).toBe(SEQUENCE_CHAPTERS[3]);
  });

  it('falls back to the first act for an act that does not exist', () => {
    const { result } = setup();

    act(() => result.current.runtime.onSceneChapterChange(99));

    expect(result.current.currentChapter).toBe(SEQUENCE_CHAPTERS[0]);
  });
});

describe('usePremiereController: transport', () => {
  it('pauses and resumes, showing what the scene settled on', () => {
    const { result, store } = setup();

    act(() => result.current.togglePlayback());
    expect(result.current.isPlaying).toBe(false);
    expect(store().isPlaying).toBe(false);

    act(() => result.current.togglePlayback());
    expect(result.current.isPlaying).toBe(true);
    expect(store().isPlaying).toBe(true);
  });

  it('scrubs the scene and the display together', () => {
    const { result, store } = setup();

    act(() => result.current.scrub(12.5));

    expect(result.current.currentTime).toBe(12.5);
    expect(store().currentTime).toBe(12.5);
  });

  it('jumps to an act, shows it, and shimmers the audio', () => {
    const { result, store } = setup();

    act(() => result.current.selectAct(2));

    expect(result.current.activeAct).toBe(2);
    expect(store().currentTime).toBe(chapterJumpTarget(2, SEQUENCE_CHAPTERS).time);
    expect(doubles.audio[0].shimmers).toContain(2);
  });

  it('replays from the top and plays, even after the film has been paused mid-way', () => {
    const { result, store } = setup();
    act(() => result.current.scrub(20));
    act(() => result.current.togglePlayback());

    act(() => result.current.replay());

    expect(result.current.currentTime).toBe(0);
    expect(result.current.isPlaying).toBe(true);
    expect(store()).toMatchObject({ currentTime: 0, isPlaying: true });
  });

  it('leaves orbit when replaying, returning the camera to the cinema path', () => {
    const { result, store } = setup();
    act(() => result.current.toggleCameraMode());
    expect(result.current.cameraMode).toBe('orbit');

    act(() => result.current.replay());

    expect(result.current.cameraMode).toBe('cinema');
    expect(store().cameraMode).toBe('cinema');
  });

  it('keeps the cinema camera on replay when it was already cinema', () => {
    const { result, store } = setup();

    act(() => result.current.replay());

    expect(result.current.cameraMode).toBe('cinema');
    expect(store().cameraMode).toBe('cinema');
  });
});

describe('usePremiereController: scene options', () => {
  it('flips between the cinema and orbit cameras', () => {
    const { result, store } = setup();

    act(() => result.current.toggleCameraMode());
    expect([result.current.cameraMode, store().cameraMode]).toEqual(['orbit', 'orbit']);
    act(() => result.current.toggleCameraMode());
    expect([result.current.cameraMode, store().cameraMode]).toEqual(['cinema', 'cinema']);
  });

  it('forces and releases the silver-nitrate look', () => {
    const { result, store } = setup();

    act(() => result.current.toggleNitrateMode());
    expect([result.current.nitrateMode, store().isNitrateForced]).toEqual([true, true]);
    act(() => result.current.toggleNitrateMode());
    expect([result.current.nitrateMode, store().isNitrateForced]).toEqual([false, false]);
  });

  it('turns the sound on and off with what the audio engine reports', () => {
    const { result } = setup();

    act(() => result.current.toggleSound());
    expect(result.current.soundOn).toBe(true);
    act(() => result.current.toggleSound());
    expect(result.current.soundOn).toBe(false);
  });

  it('applies a new hero title: stores it, jumps to the title act, plays, and shows it', () => {
    const { result, store } = setup();
    const title = { ...DEFAULT_HERO_TITLE, mainTitle: 'JAZZ' };
    act(() => result.current.togglePlayback());

    act(() => result.current.applyHeroTitle(title));

    expect(result.current.heroConfig).toEqual(title);
    expect(store().heroConfig).toEqual(title);
    expect(result.current.activeAct).toBe(4);
    expect(result.current.isPlaying).toBe(true);
    expect(store().currentTime).toBe(chapterJumpTarget(4, SEQUENCE_CHAPTERS).time);
  });

  it('leaves orbit when a title is applied, so the title is seen from the cinema camera', () => {
    const { result, store } = setup();
    act(() => result.current.toggleCameraMode());

    act(() => result.current.applyHeroTitle({ ...DEFAULT_HERO_TITLE, mainTitle: 'JAZZ' }));

    expect(result.current.cameraMode).toBe('cinema');
    expect(store().cameraMode).toBe('cinema');
  });
});

describe('usePremiereController: before the scene exists', () => {
  it('shows a change in the page even when there is no scene to apply it to', () => {
    window.history.replaceState(null, '', '/');
    const { result } = renderHook(() => usePremiereController());

    act(() => result.current.toggleNitrateMode());
    act(() => result.current.scrub(3));

    expect(result.current.nitrateMode).toBe(true);
    expect(result.current.currentTime).toBe(3);
  });

  it('does not throw when asked to play, replay or pick an act with no scene', () => {
    window.history.replaceState(null, '', '/');
    const { result } = renderHook(() => usePremiereController());

    expect(() => {
      act(() => result.current.togglePlayback());
      act(() => result.current.replay());
      act(() => result.current.selectAct(1));
      act(() => result.current.applyHeroTitle(DEFAULT_HERO_TITLE));
    }).not.toThrow();
  });
});

