import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { CinemaAudioEngine } from '../audio/cinemaAudio';
import type { CameraMode } from '../model/types';
import type { PremiereSceneApi } from '../scene/sceneApi';

interface PremiereTransportOptions {
  sceneApi: PremiereSceneApi;
  audioRef: RefObject<CinemaAudioEngine | null>;
  cameraMode: CameraMode;
  setCameraMode: Dispatch<SetStateAction<CameraMode>>;
  setCurrentTime: Dispatch<SetStateAction<number>>;
  setActiveAct: Dispatch<SetStateAction<number>>;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
}

export function usePremiereTransport({
  sceneApi,
  audioRef,
  cameraMode,
  setCameraMode,
  setCurrentTime,
  setActiveAct,
  setIsPlaying,
}: PremiereTransportOptions) {
  const togglePlayback = useCallback(() => {
    setIsPlaying(sceneApi.togglePlaying());
  }, [sceneApi, setIsPlaying]);

  const replay = useCallback(() => {
    if (cameraMode === 'orbit') {
      setCameraMode('cinema');
      sceneApi.setCameraMode('cinema');
    }
    sceneApi.setTime(0);
    sceneApi.setPlaying(true);
    setCurrentTime(0);
    setIsPlaying(true);
  }, [cameraMode, sceneApi, setCameraMode, setCurrentTime, setIsPlaying]);

  const scrub = useCallback(
    (time: number) => {
      setCurrentTime(time);
      sceneApi.setTime(time);
    },
    [sceneApi, setCurrentTime]
  );

  const selectAct = useCallback(
    (index: number) => {
      setActiveAct(index);
      sceneApi.jumpToChapter(index);
      audioRef.current?.triggerActShimmer(index);
    },
    [audioRef, sceneApi, setActiveAct]
  );

  return { togglePlayback, replay, scrub, selectAct };
}
