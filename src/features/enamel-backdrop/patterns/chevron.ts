import type { ChevronPattern, FieldFrame, PixelPoint } from '../types';
import { centredOffset } from './space';

/** Reference `WAVE_FORMS`: wave 1 is a sharp zigzag, wave 2 a soft flame stitch. */
export const WAVE_FORMS = Object.freeze([
  { label: 'Chevron', hint: 'Sharp zigzag' },
  { label: 'Bargello', hint: 'Soft flame stitch' },
] as const);

function waveform(t: number, wave: number): number {
  if (wave === 2) return Math.sin(t * Math.PI * 2);
  return 4 * Math.abs(t - Math.floor(t + 0.75) + 0.25) - 1;
}

/** Horizontal stripes displaced by a triangle or sine wave; amplitude is a fraction of the period. */
export function chevronField(point: PixelPoint, frame: FieldFrame, pattern: ChevronPattern): number {
  const { dx: u, dy: v } = centredOffset(point, frame.size);
  const swing = (pattern.period * pattern.amplitude) / 10;
  const offset = swing * waveform(u / pattern.period, pattern.wave);
  return (v - offset) / pattern.bandHeight;
}
