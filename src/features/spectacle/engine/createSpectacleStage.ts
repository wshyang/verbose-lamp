import { detectQualityEnv, qualitySettings, resolveQuality } from '../model/quality';
import type {
  EffectHandle, EffectId, EffectParamsMap, QualityPreference, SpectacleStage,
} from '../model/types';
import { effectRegistry } from './effectRegistry';
import { createEffectScheduler } from './effectScheduler';
import { createLayerRegistry } from './layers';
import type { EffectDefinition } from './types';

export interface StageOptions {
  host: HTMLElement;
  quality?: QualityPreference;
  reducedMotion?: boolean;
  onAnnounce?: (text: string) => void;
}

/**
 * Engine entry point: composes the canvas layers and the frame scheduler
 * behind the typed `play(id, params)` API (ADDENDUM-020 §3.1).
 */
export function createSpectacleStage(opts: StageOptions): SpectacleStage {
  const settings = qualitySettings(resolveQuality(opts.quality ?? 'auto', detectQualityEnv()));
  const layers = createLayerRegistry(opts.host, settings);
  const scheduler = createEffectScheduler(layers, opts.host);
  let reducedMotion = opts.reducedMotion ?? false;

  function play<K extends EffectId>(id: K, params: EffectParamsMap[K]): EffectHandle {
    const definition = effectRegistry[id] as EffectDefinition<EffectParamsMap[K]>;
    const instance = definition.create(
      {
        quality: settings,
        reducedMotion,
        announce: (text: string) => opts.onAnnounce?.(text),
      },
      params,
    );
    return scheduler.add(definition.layer, instance);
  }

  return {
    play,
    qualityTier: settings.tier,
    stopAll: scheduler.stopAll,
    setReducedMotion(value) {
      reducedMotion = value;
    },
    dispose() {
      scheduler.dispose();
      layers.dispose();
    },
  };
}
