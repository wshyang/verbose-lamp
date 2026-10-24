import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { CinemaAudioEngine } from '../audio/cinemaAudio';
import { GatsbySceneManager } from '../scene/GatsbySceneManager';
import type { CameraMode } from '../model/types';

interface PremiereTransportOptions {
  managerRef: MutableRefObject<GatsbySceneManager | null>;
  audioRef: MutableRefObject<CinemaAudioEngine | null>;
  cameraMode: CameraMode;
  setCameraMode: Dispatch<SetStateAction<CameraMode>>;
  setCurrentTime: Dispatch<SetStateAction<number>>;
  setActiveAct: Dispatch<SetStateAction<number>>;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
}

export function usePremiereTransport({
  managerRef,
  audioRef,
  cameraMode,
  setCameraMode,
  setCurrentTime,
  setActiveAct,
  setIsPlaying,
}: PremiereTransportOptions) {
  const togglePlayback = useCallback(() => {
    const manager = managerRef.current;
    if (!manager) return;
    setIsPlaying(manager.togglePlaying());
  }, [managerRef, setIsPlaying]);

  const replay = useCallback(() => {
    const manager = managerRef.current;
    if (!manager) return;
    if (cameraMode === 'orbit') {
      setCameraMode('cinema');
      manager.setCameraMode('cinema');
    }
    manager.setTime(0);
    manager.setPlaying(true);
    setCurrentTime(0);
    setIsPlaying(true);
  }, [cameraMode, managerRef, setCameraMode, setCurrentTime, setIsPlaying]);

  const scrub = useCallback((time: number) => {
    setCurrentTime(time);
    managerRef.current?.setTime(time);
  }, [managerRef, setCurrentTime]);

  const selectAct = useCallback((index: number) => {
    setActiveAct(index);
    managerRef.current?.jumpToChapter(index);
    audioRef.current?.triggerActShimmer(index);
  }, [audioRef, managerRef, setActiveAct]);

  return { togglePlayback, replay, scrub, selectAct };
}