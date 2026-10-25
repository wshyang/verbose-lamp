import { useEffect, type MutableRefObject, type RefObject } from 'react';
import { CinemaAudioEngine } from '../audio/cinemaAudio';
import type { PremiereSceneApi } from '../scene/sceneApi';
import type { PremiereStoreApi } from '../scene3d/premiereStore';
import { storeSceneApi } from '../scene3d/storeSceneApi';

interface SceneLifecycleOptions {
  mountRef: RefObject<HTMLDivElement | null>;
  managerRef: MutableRefObject<PremiereSceneApi | null>;
  audioRef: MutableRefObject<CinemaAudioEngine | null>;
  store: PremiereStoreApi;
}

/**
 * Creates the audio engine and the store-backed scene API once there is a mount element, and
 * releases both on cleanup. Nothing here touches the store, so StrictMode's mount, dispose,
 * remount leaves playback exactly where it was.
 */
export function useSceneLifecycle({ mountRef, managerRef, audioRef, store }: SceneLifecycleOptions): void {
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const audio = new CinemaAudioEngine();
    audioRef.current = audio;

    const scene = storeSceneApi(store);
    managerRef.current = scene;
    return () => {
      scene.dispose();
      audio.dispose();
      managerRef.current = null;
      audioRef.current = null;
    };
  }, [audioRef, managerRef, mountRef, store]);
}
