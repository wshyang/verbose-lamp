import { useEffect, useRef, useState } from 'react';
import { CinemaAudioEngine } from '../audio/cinemaAudio';
import { parseFreezeAt } from '../model/freeze';
import type { PlaybackTelemetry, PremiereSceneApi } from '../scene/sceneApi';
import { createPremiereStore, type PremiereStore } from '../scene3d/premiereStore';
import { storeSceneApi } from '../scene3d/storeSceneApi';

interface PremiereRuntimeOptions {
  onTelemetry: (telemetry: PlaybackTelemetry) => void;
  onChapterChange: (chapterIndex: number) => void;
}

export interface PremiereRuntime {
  store: PremiereStore;
  sceneApi: PremiereSceneApi;
  audioRef: { current: CinemaAudioEngine | null };
}

/** Owns the audio engine and creates the one R3F store + scene-API adapter. */
export function usePremiereRuntime({ onTelemetry, onChapterChange }: PremiereRuntimeOptions): PremiereRuntime {
  const callbacksRef = useRef({ onTelemetry, onChapterChange });
  callbacksRef.current = { onTelemetry, onChapterChange };
  const audioRef = useRef<CinemaAudioEngine | null>(null);

  const [store] = useState(() =>
    createPremiereStore({
      freezeAt: parseFreezeAt(window.location.search),
      onTelemetry: (telemetry) => callbacksRef.current.onTelemetry(telemetry),
      onChapterChange: (chapterIndex) => {
        callbacksRef.current.onChapterChange(chapterIndex);
        audioRef.current?.triggerActShimmer(chapterIndex);
      },
    })
  );
  const [sceneApi] = useState(() => storeSceneApi(store));

  useEffect(() => {
    const audio = new CinemaAudioEngine();
    audioRef.current = audio;
    return () => {
      audio.dispose();
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, []);

  return { store, sceneApi, audioRef };
}
