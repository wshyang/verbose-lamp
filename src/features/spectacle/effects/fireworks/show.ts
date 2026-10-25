import { DEFAULT_SEED, mulberry32 } from '@/shared/lib/random';
import { circleOverlapsRect } from '../../model/geometry';
import type { FireworkShellType, NormRect } from '../../model/types';

export interface ShellEvent {
  tMs: number;
  x: number;
  y: number;
  depth: number;
  type: FireworkShellType;
}

export interface ShowOptions {
  durationMs?: number;
  intensity?: number;
  seed?: number;
  finale?: boolean;
  keepClear?: readonly NormRect[];
  aspect?: number;
}

const WEIGHTED: readonly FireworkShellType[] = [
  'willow', 'willow', 'kamuro', 'kamuro', 'peony', 'peony', 'chrysanthemum',
  'chrysanthemum', 'palm', 'ring', 'crossette', 'strobe', 'double-break',
];

/** Projected burst radius in aspect-corrected normalized units. */
export function burstRadiusNorm(depth: number): number {
  return 0.13 + (1 - depth) * 0.07;
}

function pickPoint(
  rng: () => number,
  keepClear: readonly NormRect[],
  aspect: number,
): { x: number; y: number; depth: number } | null {
  for (let attempt = 0; attempt < 14; attempt += 1) {
    const x = 0.08 + rng() * 0.84;
    const y = 0.06 + rng() * 0.56;
    const depth = rng();
    const r = burstRadiusNorm(depth) + 0.02;
    const blocked = keepClear.some((rect) => circleOverlapsRect({ centre: { x, y }, radius: r, rect, aspect }));
    if (!blocked) return { x, y, depth };
  }
  return null;
}

/** Pure, seeded show scheduler. Never places a burst over a keep-clear rect. */
export function planShow(opts: ShowOptions): readonly ShellEvent[] {
  const duration = opts.durationMs ?? 12000;
  const intensity = Math.min(1, Math.max(0, opts.intensity ?? 0.5));
  const rng = mulberry32(opts.seed ?? DEFAULT_SEED);
  const keepClear = opts.keepClear ?? [];
  const aspect = opts.aspect ?? 16 / 9;
  const events: ShellEvent[] = [];
  const bodyMs = opts.finale ? Math.max(1000, duration - 3500) : duration;
  const count = Math.round((bodyMs / 1000) * (0.5 + intensity * 1.7));
  for (let i = 0; i < count; i += 1) {
    const p = pickPoint(rng, keepClear, aspect);
    if (!p) continue;
    const type = WEIGHTED[Math.floor(rng() * WEIGHTED.length)];
    events.push({ tMs: (i + rng() * 0.8) * (bodyMs / count), ...p, type });
  }
  if (opts.finale) addFinale(events, { rng, durationMs: duration, keepClear, aspect });
  return events.sort((a, b) => a.tMs - b.tMs);
}

interface FinaleContext {
  rng: () => number;
  durationMs: number;
  keepClear: readonly NormRect[];
  aspect: number;
}

function addFinale(events: ShellEvent[], finale: FinaleContext): void {
  const { rng, durationMs: duration, keepClear, aspect } = finale;
  const start = duration - 3500;
  for (let i = 0; i < 16; i += 1) {
    const p = pickPoint(rng, keepClear, aspect);
    if (!p) continue;
    const type = i % 5 === 4 ? 'strobe' : WEIGHTED[Math.floor(rng() * WEIGHTED.length)];
    events.push({ tMs: start + (i / 16) * 3200 + rng() * 150, ...p, type });
  }
}