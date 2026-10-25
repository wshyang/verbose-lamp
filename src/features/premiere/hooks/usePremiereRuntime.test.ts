// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupDomTests } from '@/test/dom';
import type { PremiereSceneApi } from '../scene/sceneApi';
import { usePremiereRuntime } from './usePremiereRuntime';

setupDomTests();

const state = vi.hoisted(() => ({
  scenes: [] as Array<{ container: unknown; options: Record<string, unknown>; dispose: ReturnType<typeof vi.fn> }>,
  audios: [] as Array<{ shimmer: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }>,
}));

vi.mock('../scene/GatsbySceneManager', () => ({
  GatsbySceneManager: class {
    dispose = vi.fn();

    constructor(container: unknown, options: Record<string, unknown>) {
      state.scenes.push({ container, options, dispose: this.dispose });
    }
  },
}));

vi.mock('../audio/cinemaAudio', () => ({
  CinemaAudioEngine: class {
    shimmer = vi.fn();
    dispose = vi.fn();

    constructor() {
      state.audios.push({ shimmer: this.shimmer, dispose: this.dispose });
    }

    triggerActShimmer(index: number) {
      this.shimmer(index);
    }
  },
}));

afterEach(() => {
  state.scenes.length = 0;
  state.audios.length = 0;
  window.history.replaceState({}, '', '/');
});

function mount({ container = document.createElement('div') as HTMLDivElement | null } = {}) {
  const mountRef = { current: container };
  const managerRef = { current: null as PremiereSceneApi | null };
  const audioRef = { current: null as unknown as import('../audio/cinemaAudio').CinemaAudioEngine | null };
  const onTelemetry = vi.fn();
  const onChapterChange = vi.fn();
  const { result, unmount } = renderHook(() =>
    usePremiereRuntime({ mountRef, managerRef, audioRef, onTelemetry, onChapterChange }),
  );
  return { result, unmount, managerRef, audioRef, onTelemetry, onChapterChange };
}

describe('usePremiereRuntime', () => {
  it('does nothing without a mount node', () => {
    mount({ container: null });

    expect(state.scenes).toHaveLength(0);
    expect(state.audios).toHaveLength(0);
  });
});
