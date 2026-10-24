import { beforeEach, describe, expect, it } from 'vitest';
import { buildChop } from './chop.js';
import { dieForStation } from './chopAssign.js';
import { chopSeedFor } from './chopSeeds.js';
import { CHOP_STACK_MAX, MIN_PRESSURE_GAP, MIN_ROTATION_GAP, buildChopStack } from './chopStack.js';

/**
 * ADR-262 — the stack a station's row draws: capped, and varied on purpose.
 *
 * Distinct seeds made two strikes *unlikely* to match; these tests hold the
 * stronger promise the page makes — within the drawn stack, no strike sits at
 * the same turn or the same pressure as the one beneath it.
 */

beforeEach(() => {
  window.localStorage.clear();
});

describe('ADR-262 — a station’s stack of strikes', () => {
  it('draws at most the cap, however many completions stand behind it', () => {
    expect(buildChopStack('station-busy', 'Beach Dash', 9)).toHaveLength(CHOP_STACK_MAX);
    expect(buildChopStack('station-busy', 'Beach Dash', 2)).toHaveLength(2);
    expect(buildChopStack('station-busy', 'Beach Dash', 0)).toEqual([]);
  });

  it('keeps the first strike the one the device has always shown', () => {
    const stack = buildChopStack('station-first', 'Beach Dash', 3);
    expect(stack[0]).toEqual(
      buildChop(chopSeedFor('station-first'), dieForStation('station-first'), 'Beach Dash'),
    );
  });

  it('turns and presses every strike differently from the one beneath it', () => {
    for (const stationId of ['station-a', 'station-b', 'station-c', 'station-d']) {
      const stack = buildChopStack(stationId, 'Beach Dash', CHOP_STACK_MAX);
      for (let index = 1; index < stack.length; index += 1) {
        const next = stack[index];
        const previous = stack[index - 1];
        expect(
          Math.abs((next?.placement.rotation ?? 0) - (previous?.placement.rotation ?? 0)),
        ).toBeGreaterThanOrEqual(MIN_ROTATION_GAP);
        expect(
          Math.abs((next?.pressure.floor ?? 0) - (previous?.pressure.floor ?? 0)),
        ).toBeGreaterThanOrEqual(MIN_PRESSURE_GAP);
      }
    }
  });

  it('builds the same stack on every visit', () => {
    expect(buildChopStack('station-steady', 'Beach Dash', 3)).toEqual(
      buildChopStack('station-steady', 'Beach Dash', 3),
    );
  });
});
