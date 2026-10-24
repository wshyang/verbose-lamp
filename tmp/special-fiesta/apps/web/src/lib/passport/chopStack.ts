import { buildChop, type ChopSpec } from './chop.js';
import { dieForStation } from './chopAssign.js';
import { chopSeedFor, derivedSeed } from './chopSeeds.js';

/**
 * ADR-262 — one station's stack of strikes, at most this many drawn. A station
 * completed more often than that keeps its count on the row, and the page folds
 * the rest into a "+N more" pill: the stack is a picture of repeat visits, not
 * an archive, and every impression carries two turbulence filters besides.
 */
export const CHOP_STACK_MAX = 3;

/** The least turn, in degrees, one strike must sit from the strike under it. */
export const MIN_ROTATION_GAP = 3;
/** The least difference in pressure floor (0–1) between neighbouring strikes. */
export const MIN_PRESSURE_GAP = 0.06;
/** Redraws a too-alike strike is allowed before the closest attempt is kept. */
const MAX_ATTEMPTS = 24;

/**
 * ADR-262 — a strike earns its place over the previous one by differing where a
 * thumb can see it: its turn and its pressure. Distinct seeds (ADR-261) made
 * lookalikes unlikely; this makes them impossible within the gaps above, by
 * redrawing from the next salted stream until the new strike clears both.
 */
function seedFor(base: number, index: number, attempt: number): number {
  return index === 0 ? base : derivedSeed(base, index, attempt);
}

function differsEnough(next: ChopSpec, previous: ChopSpec): boolean {
  return (
    Math.abs(next.placement.rotation - previous.placement.rotation) >= MIN_ROTATION_GAP &&
    Math.abs(next.pressure.floor - previous.pressure.floor) >= MIN_PRESSURE_GAP
  );
}

/**
 * The impressions a station's row draws: first strike first, capped at
 * `CHOP_STACK_MAX`, each guaranteed to sit turned and pressed differently
 * from the one beneath it. Zero completions draws nothing.
 */
export function buildChopStack(
  stationId: string,
  stationName: string,
  completions: number,
): ChopSpec[] {
  const count = Math.min(Math.max(completions, 0), CHOP_STACK_MAX);
  if (count === 0) return [];
  const base = chopSeedFor(stationId);
  const die = dieForStation(stationId);
  const stack: ChopSpec[] = [];
  for (let index = 0; index < count; index += 1) {
    let attempt = 0;
    let chop = buildChop(seedFor(base, index, attempt), die, stationName);
    const previous = stack[index - 1];
    while (previous !== undefined && !differsEnough(chop, previous) && attempt < MAX_ATTEMPTS) {
      attempt += 1;
      chop = buildChop(seedFor(base, index, attempt), die, stationName);
    }
    stack.push(chop);
  }
  return stack;
}
