import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { CinemaAudioEngine } from '../audio/cinemaAudio';
import type { CameraMode, HeroTitleConfig } from '../model/types';
import type { PremiereSceneApi } from '../scene/sceneApi';

interface PremiereSceneOptions {
  sceneApi: PremiereSceneApi;
  audioRef: RefObject<CinemaAudioEngine | null>;
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
  sceneApi,
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
    sceneApi.setCameraMode(nextMode);
  }, [cameraMode, sceneApi, setCameraMode]);

  const toggleNitrateMode = useCallback(() => {
    const nextMode = !nitrateMode;
    setNitrateMode(nextMode);
    sceneApi.setNitrateMode(nextMode);
  }, [nitrateMode, sceneApi, setNitrateMode]);

  const toggleSound = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setSoundOn(audio.toggle());
  }, [audioRef, setSoundOn]);

  const applyHeroTitle = useCallback(
    (config: HeroTitleConfig) => {
      setHeroConfig(config);
      sceneApi.updateHeroTitle(config);
      if (cameraMode === 'orbit') {
        setCameraMode('cinema');
        sceneApi.setCameraMode('cinema');
      }
      sceneApi.jumpToChapter(4);
      sceneApi.setPlaying(true);
      setActiveAct(4);
      setIsPlaying(true);
    },
    [cameraMode, sceneApi, setActiveAct, setCameraMode, setHeroConfig, setIsPlaying]
  );

  return { toggleCameraMode, toggleNitrateMode, toggleSound, applyHeroTitle };
}
