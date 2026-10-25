import { useEffect, type MutableRefObject, type RefObject } from 'react';
import { CinemaAudioEngine } from '../audio/cinemaAudio';
import { parseFreezeAt } from '../model/freeze';
import type { RendererMode } from '../model/renderer';
import { GatsbySceneManager } from '../scene/GatsbySceneManager';
import type { PlaybackTelemetry, PremiereSceneApi } from '../scene/sceneApi';
import { storeSceneApi, type PremiereStoreApi } from '../scene3d/premiereStore';

interface RendererMountSources {
  mountRef: RefObject<HTMLDivElement | null>;
  managerRef: MutableRefObject<PremiereSceneApi | null>;
  audioRef: MutableRefObject<CinemaAudioEngine | null>;
  onTelemetry: (telemetry: PlaybackTelemetry) => void;
  onChapterChange: (chapterIndex: number) => void;
}

interface RendererMountTarget {
  renderer: RendererMode;
  store: PremiereStoreApi | null;
}

/**
 * Mounts the selected renderer and disposes it — with the audio engine — on
 * unmount. React Three Fiber is the default; `?renderer=classic` keeps the
 * imperative manager alive while the screenshot gate is outstanding
 * (ADDENDUM-026 §5).
 */
export function useRendererMount(sources: RendererMountSources, target: RendererMountTarget) {
  const { mountRef, managerRef, audioRef, onTelemetry, onChapterChange } = sources;
  const { renderer, store } = target;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const audio = new CinemaAudioEngine();
    audioRef.current = audio;

    if (renderer === 'r3f' && store) {
      managerRef.current = storeSceneApi(store);
      return () => {
        audio.dispose();
        managerRef.current = null;
        audioRef.current = null;
      };
    }

    const manager = new GatsbySceneManager(container, {
      freezeAt: parseFreezeAt(window.location.search) ?? undefined,
      onTelemetry: (telemetry) => onTelemetry(telemetry),
      onChapterChange: (chapterIndex) => {
        onChapterChange(chapterIndex);
        audio.triggerActShimmer(chapterIndex);
      },
    });
    managerRef.current = manager;

    return () => {
      manager.dispose();
      audio.dispose();
      managerRef.current = null;
      audioRef.current = null;
    };
  }, [audioRef, managerRef, mountRef, onChapterChange, onTelemetry, renderer, store]);
}
