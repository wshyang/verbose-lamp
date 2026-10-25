/**
 * Gold gradient ramps for photographs (stop lists and the 256-entry RGB lookup built from them).
 * Not the same as `gilded-ui`'s `GOLD_RAMPS`, which are five-colour UI palettes.
 */
export type { GoldRampDefinition, GoldRampId, GoldRampStop } from './types';
export { GOLD_RAMPS, buildGoldRampLut } from './goldRamp';
