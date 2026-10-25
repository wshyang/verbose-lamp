import { GOLD_RAMPS, type GoldRampId } from './goldRamps';

export interface GoldTableValues {
  r: string;
  g: string;
  b: string;
}

function channel(hex: string, index: number): number {
  return parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
}

/** GOLD_RAMPS[id] → per-channel feComponentTransfer tableValues strings. */
export function goldTableValues(id: GoldRampId): GoldTableValues {
  const ramp = GOLD_RAMPS[id];
  return {
    r: ramp.map((hex) => channel(hex, 0).toFixed(4)).join(' '),
    g: ramp.map((hex) => channel(hex, 1).toFixed(4)).join(' '),
    b: ramp.map((hex) => channel(hex, 2).toFixed(4)).join(' '),
  };
}