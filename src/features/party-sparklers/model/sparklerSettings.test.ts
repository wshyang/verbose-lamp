import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SPARKLER_ORIGIN,
  DEFAULT_SPARKLER_SETTINGS,
  SPARKLER_LIMITS,
  clampSparklerSettings,
  sparklerParams,
} from './sparklerSettings';

describe('clampSparklerSettings', () => {
  it('keeps the defaults when nothing is passed', () => {
    expect(clampSparklerSettings({})).toEqual(DEFAULT_SPARKLER_SETTINGS);
  });

  it('bounds the count and rounds it', () => {
    expect(clampSparklerSettings({ count: 0 }).count).toBe(SPARKLER_LIMITS.count.min);
    expect(clampSparklerSettings({ count: 99 }).count).toBe(SPARKLER_LIMITS.count.max);
    expect(clampSparklerSettings({ count: 2.6 }).count).toBe(3);
  });

  it('bounds the duration and the spread', () => {
    expect(clampSparklerSettings({ durationSec: 0.1 }).durationSec).toBe(
      SPARKLER_LIMITS.durationSec.min
    );
    expect(clampSparklerSettings({ durationSec: 60 }).durationSec).toBe(
      SPARKLER_LIMITS.durationSec.max
    );
    expect(clampSparklerSettings({ spread: 5 }).spread).toBe(SPARKLER_LIMITS.spread.max);
    expect(clampSparklerSettings({ spread: -1 }).spread).toBe(SPARKLER_LIMITS.spread.min);
  });

  it('falls back to the defaults for values that are not numbers', () => {
    const settings = clampSparklerSettings({
      durationSec: Number.NaN,
      spread: Number.POSITIVE_INFINITY,
      count: Number.NaN,
    });
    expect(settings.durationSec).toBe(DEFAULT_SPARKLER_SETTINGS.durationSec);
    expect(settings.spread).toBe(DEFAULT_SPARKLER_SETTINGS.spread);
    expect(settings.count).toBe(SPARKLER_LIMITS.count.min);
  });

  it('keeps a legal setting untouched', () => {
    const legal = { count: 5, durationSec: 4, spread: 0.25 };
    expect(clampSparklerSettings(legal)).toEqual(legal);
  });
});

describe('sparklerParams', () => {
  it('sends seconds as milliseconds and passes the fan through', () => {
    expect(sparklerParams({ count: 4, durationSec: 2.5, spread: 0.2 })).toEqual({
      origin: DEFAULT_SPARKLER_ORIGIN,
      count: 4,
      durationMs: 2500,
      spread: 0.2,
    });
  });

  it('accepts the point the host clicked', () => {
    const origin = { x: 0.2, y: 0.9 };
    expect(sparklerParams(DEFAULT_SPARKLER_SETTINGS, origin).origin).toEqual(origin);
  });
});
