import { useState } from 'react';
import { DEFAULT_HERO_TITLE } from '../data/sequence';
import type { CameraMode, HeroTitleConfig } from '../model/types';

/** The viewer's own choices: camera, nitrate look, sound and the hero title. */
export function usePremiereSettings() {
  const [cameraMode, setCameraMode] = useState<CameraMode>('cinema');
  const [nitrateMode, setNitrateMode] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [heroConfig, setHeroConfig] = useState<HeroTitleConfig>({ ...DEFAULT_HERO_TITLE });

  return {
    cameraMode, setCameraMode,
    nitrateMode, setNitrateMode,
    soundOn, setSoundOn,
    heroConfig, setHeroConfig,
  };
}
