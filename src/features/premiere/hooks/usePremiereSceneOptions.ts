import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { CinemaAudioEngine } from '../audio/cinemaAudio';
import { GatsbySceneManager } from '../scene/GatsbySceneManager';
import type { CameraMode, HeroTitleConfig } from '../model/types';

interface PremiereSceneOptions {
  managerRef: MutableRefObject<GatsbySceneManager | null>;
  audioRef: MutableRefObject<CinemaAudioEngine | null>;
  cameraMode: CameraMode;
  nitrateMode: boolean;
  setCameraMode: Dispatch<SetStateAction<CameraMode>>;
  setNitrateMode: Dispatch<SetStateAction<boolean>>;
  setSoundOn: Dispatch<SetStateAction<boolean>>;
  setHeroConfig: Dispatch<SetStateAction<HeroTitleConfig>>;
  setActiveAct: Dispatch<SetStateAction<number>>;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
}

export function usePremiereSceneOptions({
  managerRef,
  audioRef,
  cameraMode,
  nitrateMode,
  setCameraMode,
  setNitrateMode,
  setSoundOn,
  setHeroConfig,
  setActiveAct,
  setIsPlaying,
}: PremiereSceneOptions) {
  const toggleCameraMode = useCallback(() => {
    const nextMode: CameraMode = cameraMode === 'cinema' ? 'orbit' : 'cinema';
    setCameraMode(nextMode);
    managerRef.current?.setCameraMode(nextMode);
  }, [cameraMode, managerRef, setCameraMode]);

  const toggleNitrateMode = useCallback(() => {
    const nextMode = !nitrateMode;
    setNitrateMode(nextMode);
    managerRef.current?.setNitrateMode(nextMode);
  }, [managerRef, nitrateMode, setNitrateMode]);

  const toggleSound = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setSoundOn(audio.toggle());
  }, [audioRef, setSoundOn]);

  const applyHeroTitle = useCallback((config: HeroTitleConfig) => {
    setHeroConfig(config);
    const manager = managerRef.current;
    if (!manager) return;
    manager.updateHeroTitle(config);
    if (cameraMode === 'orbit') {
      setCameraMode('cinema');
      manager.setCameraMode('cinema');
    }
    manager.jumpToChapter(4);
    manager.setPlaying(true);
    setActiveAct(4);
    setIsPlaying(true);
  }, [cameraMode, managerRef, setActiveAct, setCameraMode, setHeroConfig, setIsPlaying]);

  return { toggleCameraMode, toggleNitrateMode, toggleSound, applyHeroTitle };
}