/** Tiny colour helpers for the enamel renderer. Pure; no allocation beyond the result. */

export type Rgb = readonly [number, number, number];

export function parseHexColour(hex: string): Rgb {
  const match = /^#?([\da-f]{6})$/i.exec(hex.trim());
  if (!match) return [0, 0, 0];
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function mixRgb(base: Rgb, over: Rgb, amount: number): Rgb {
  const share = Math.min(1, Math.max(0, amount));
  return [base[0] + (over[0] - base[0]) * share, base[1] + (over[1] - base[1]) * share, base[2] + (over[2] - base[2]) * share];
}

export function scaleRgb(colour: Rgb, factor: number): Rgb {
  return [colour[0] * factor, colour[1] * factor, colour[2] * factor];
}

export function lumaOf(colour: Rgb): number {
  return (colour[0] * 0.2126 + colour[1] * 0.7152 + colour[2] * 0.0722) / 255;
}

/** A colour from a 256-entry RGB lookup table (as built by `buildGoldRampLut`). */
export function rampColour(lut: Uint8Array, position: number): Rgb {
  const index = Math.round(Math.min(1, Math.max(0, position)) * 255) * 3;
  return [lut[index], lut[index + 1], lut[index + 2]];
}
