import type { BackdropId, RgbaImage } from './types';

interface BackdropPalette {
  readonly base: readonly [number, number, number];
  readonly glow: readonly [number, number, number];
  readonly accent: readonly [number, number, number];
}

const PALETTES: Readonly<Record<BackdropId, BackdropPalette>> = Object.freeze({
  'sapphire-fan': { base: [8, 28, 61], glow: [31, 91, 126], accent: [218, 177, 61] },
  'emerald-lacquer': { base: [5, 42, 36], glow: [23, 102, 73], accent: [239, 196, 76] },
  'ruby-mosaic': { base: [54, 8, 23], glow: [133, 28, 45], accent: [231, 181, 61] },
});

export const ART_BACKDROPS = Object.freeze([
  { id: 'sapphire-fan', name: 'Sapphire Fan', colour: '#17567c' },
  { id: 'emerald-lacquer', name: 'Emerald Lacquer', colour: '#176649' },
  { id: 'ruby-mosaic', name: 'Ruby Mosaic', colour: '#851c2d' },
] as const);

function mix(left: number, right: number, amount: number): number {
  return Math.round(left + (right - left) * amount);
}

function isGoldLine(x: number, y: number, width: number, height: number): boolean {
  const scale = Math.max(12, Math.min(width, height) / 8);
  const radial = Math.hypot(x - width / 2, y - height * 0.78);
  const fan = Math.abs((Math.atan2(y - height * 0.78, x - width / 2) * 10) % 1);
  return radial % scale < 1.4 || fan < 0.025 || Math.abs(x - width / 2) < 1;
}

export function buildArtBackdrop(width: number, height: number, id: BackdropId): RgbaImage {
  const palette = PALETTES[id];
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const wave = (Math.sin(x * 0.035) + Math.cos(y * 0.027) + 2) / 4;
      const line = isGoldLine(x, y, width, height);
      const colour = line ? palette.accent : palette.base.map((value, index) => mix(value, palette.glow[index], wave));
      data[offset] = colour[0];
      data[offset + 1] = colour[1];
      data[offset + 2] = colour[2];
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}

export function compositeImages(foreground: RgbaImage, background: RgbaImage): RgbaImage {
  if (foreground.width !== background.width || foreground.height !== background.height) {
    throw new RangeError('Foreground and backdrop dimensions must match.');
  }
  const output = new Uint8ClampedArray(foreground.data.length);
  for (let offset = 0; offset < output.length; offset += 4) {
    const alpha = foreground.data[offset + 3] / 255;
    for (let channel = 0; channel < 3; channel += 1) {
      output[offset + channel] = mix(background.data[offset + channel], foreground.data[offset + channel], alpha);
    }
    output[offset + 3] = 255;
  }
  return { width: foreground.width, height: foreground.height, data: output };
}