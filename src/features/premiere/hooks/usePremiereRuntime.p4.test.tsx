// @vitest-environment jsdom
// From PR #4 (cases this branch did not already assert; see ADDENDUM-036).
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { type CinemaAudioEngine } from '../audio/cinemaAudio';
import { type PremiereSceneApi, type PlaybackTelemetry } from '../scene/sceneApi';
import { usePremiereRuntime } from './usePremiereRuntime';

const sceneManager = vi.hoisted(() => ({
  instances: [] as Array<{ container: HTMLElement; options: Record<string, unknown>; dispose: () => void }>,
}));
vi.mock('../scene/GatsbySceneManager', () => ({
  GatsbySceneManager: class {
    dispose = vi.fn();
    constructor(container: HTMLElement, options: Record<string, unknown>) {
      sceneManager.instances.push({ container, options, dispose: this.dispose });
    }
  },
}));
function makeCallbacks() {
  return { onTelemetry: vi.fn<(t: PlaybackTelemetry) => void>(), onChapterChange: vi.fn<(i: number) => void>() };
}
function setSearch(search: string): void {
  window.history.replaceState({}, '', `/${search}`);
}
describe('usePremiereRuntime', () => {
  beforeEach(() => {
    sceneManager.instances = [];
    setSearch('');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setSearch('');
  });

  /**
   * The ref must hold the container *before* the hook mounts: its effect reads
   * `mountRef.current` once, exactly like the stage div in the app.
   */
  function renderRuntime({ withContainer = true } = {}) {
    const element = document.createElement('div');
    if (withContainer) document.body.appendChild(element);
    const mountRef = { current: withContainer ? element : null };
    const managerRef = { current: null as PremiereSceneApi | null };
    const audioRef = { current: null as CinemaAudioEngine | null };
    const callbacks = makeCallbacks();
    const hook = renderHook(() => usePremiereRuntime({ mountRef, managerRef, audioRef, ...callbacks }));
    return { element, mountRef, managerRef, audioRef, callbacks, hook };
  }

  it('passes ?freezeAt into the store', () => {
    setSearch('?freezeAt=12.5');
    const { hook } = renderRuntime();
    expect(hook.result.current.store?.getState().freezeAt).toBe(12.5);
  });
});
