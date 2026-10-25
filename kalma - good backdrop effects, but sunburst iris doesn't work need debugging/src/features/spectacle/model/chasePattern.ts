import { hash01 } from '@/shared/lib/random';

export type ChaseMode = 'chase' | 'alternate' | 'sparkle' | 'all-on';

/** Bulb brightness 0..1 for a marquee frame. Pure, so it is testable. */
export function chasePattern(bulbIndex: number, frame: number, mode: ChaseMode): number {
  switch (mode) {
    case 'chase':
      return ((bulbIndex - frame) % 6 + 6) % 6 < 2 ? 1 : 0.22;
    case 'alternate':
      return (bulbIndex + frame) % 2 === 0 ? 1 : 0.22;
    case 'sparkle':
      return hash01(bulbIndex, frame) > 0.55 ? 1 : 0.2;
    case 'all-on':
      return 1;
  }
}