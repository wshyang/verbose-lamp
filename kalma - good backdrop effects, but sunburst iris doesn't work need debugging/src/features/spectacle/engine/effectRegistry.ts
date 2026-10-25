import { champagneEffect } from '../effects/champagne/champagneEffect';
import { confettiEffect } from '../effects/confetti/confettiEffect';
import { countdownEffect } from '../effects/countdown/countdownEffect';
import { fireworksEffect } from '../effects/fireworks/fireworksEffect';
import { flashEffect } from '../effects/flash/flashEffect';
import { nameRevealEffect } from '../effects/nameReveal/nameRevealEffect';
import { orbsEffect } from '../effects/orbs/orbsEffect';
import { searchlightsEffect } from '../effects/searchlights/searchlightsEffect';
import { sunburstEffect } from '../effects/sunburst/sunburstEffect';
import type { EffectParamsMap } from '../model/types';
import type { EffectDefinition } from './types';

/** A new effect is one new folder plus one line here (ADDENDUM-020 §3.1). */
export const effectRegistry: {
  [K in keyof EffectParamsMap]: EffectDefinition<EffectParamsMap[K]>;
} = {
  fireworks: fireworksEffect,
  'orb-transition': orbsEffect,
  'sunburst-wipe': sunburstEffect,
  confetti: confettiEffect,
  champagne: champagneEffect,
  searchlights: searchlightsEffect,
  countdown: countdownEffect,
  'name-reveal': nameRevealEffect,
  flash: flashEffect,
};