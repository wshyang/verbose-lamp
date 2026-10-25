import type { NormPoint, SparklerParams } from '@/features/spectacle';

/** Where the fan is planted when the caller does not say. */
export const DEFAULT_SPARKLER_ORIGIN: NormPoint = { x: 0.5, y: 0.68 };

export interface SparklerSettings {
  /** Sticks in the fan, 1..6. */
  count: number;
  /** Seconds the sticks burn for. */
  durationSec: number;
  /** Half-width of the fan, in viewport fractions. */
  spread: number;
}

export const SPARKLER_LIMITS = {
  count: { min: 1, max: 6 },
  durationSec: { min: 1, max: 8 },
  spread: { min: 0.05, max: 0.35 },
} as const;

export const DEFAULT_SPARKLER_SETTINGS: SparklerSettings = {
  count: 3,
  durationSec: 3.2,
  spread: 0.18,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Rounds the count, bounds every control, and survives nonsense input. */
export function clampSparklerSettings(input: Partial<SparklerSettings>): SparklerSettings {
  const { count, durationSec, spread } = { ...DEFAULT_SPARKLER_SETTINGS, ...input };
  return {
    count: clamp(Math.round(Number.isFinite(count) ? count : 0), SPARKLER_LIMITS.count.min, SPARKLER_LIMITS.count.max),
    durationSec: clamp(
      Number.isFinite(durationSec) ? durationSec : DEFAULT_SPARKLER_SETTINGS.durationSec,
      SPARKLER_LIMITS.durationSec.min,
      SPARKLER_LIMITS.durationSec.max
    ),
    spread: clamp(
      Number.isFinite(spread) ? spread : DEFAULT_SPARKLER_SETTINGS.spread,
      SPARKLER_LIMITS.spread.min,
      SPARKLER_LIMITS.spread.max
    ),
  };
}

/** Settings → the effect's parameters. Seconds become milliseconds here, once. */
export function sparklerParams(
  settings: SparklerSettings,
  origin: NormPoint = DEFAULT_SPARKLER_ORIGIN
): SparklerParams {
  return {
    origin,
    count: settings.count,
    durationMs: Math.round(settings.durationSec * 1000),
    spread: settings.spread,
  };
}
