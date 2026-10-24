import { readItem, writeItem } from '../storage/localStore.js';
import { seededRandom } from './chopRandom.js';

/**
 * ADR-240 — the chop each station shows, kept on the device.
 *
 * A station's seed is drawn the first time its chop is shown, and kept under
 * `psd.passportChops.v1`, so the same phone shows the same impression on every visit. Only the
 * seed is stored. `buildChop` turns it into the look (ADR-241), which is why a change to that
 * recipe redraws every chop already stamped.
 *
 * This key is deliberately outside the data cache. Sign-in and sign-out purge `psd.cache.v1`, and
 * the look belongs to the device, not to whoever last signed in on it.
 *
 * localStore keeps a value in memory when the browser refuses the write. It does not prefer that
 * memory over a value the browser still holds, so a page keeps its own seeds in `shownThisVisit`
 * as well. Either way a chop does not change under the participant's eyes.
 */

export const CHOP_SEED_KEY = 'psd.passportChops.v1';

type SeedMap = Record<string, number>;

/** The seeds this page has already settled on, whatever the browser did with them. */
const shownThisVisit = new Map<string, number>();

function isSeed(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 0xffffffff;
}

/** Anything but an object of whole-number seeds is treated as absent, not trusted. */
function parseSeeds(raw: string | null): SeedMap {
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const values = Object.values(parsed);
    return values.every(isSeed) ? (parsed as SeedMap) : {};
  } catch {
    return {};
  }
}

function drawSeed(): number {
  // A one-element array always has index 0, so the assertion holds without a fallback branch.
  return crypto.getRandomValues(new Uint32Array(1))[0] as number;
}

/**
 * ADR-261 — the seed of one deeper strike at a station whose first strike this device holds.
 *
 * Repeat strikes are derived, not stored: the kept seed feeds the same mulberry stream the
 * chops themselves use, and strike N takes the stream's Nth whole number. The first chop is
 * not derived at all — it keeps the kept seed untouched, so a passport stamped before repeats
 * existed does not redraw — and no second map has to survive on a device that loses storage.
 * Changing this derivation redraws every repeat chop already shown, like changing any recipe.
 */
export function derivedSeed(base: number, index: number, attempt = 0): number {
  // Attempt 0 is the derivation ADR-261 shipped; a caller redrawing a strike that
  // landed too close to its neighbour (ADR-262) salts the stream and tries again.
  const stream = seededRandom(attempt === 0 ? base : (base ^ Math.imul(attempt, 0x9e3779b9)) >>> 0);
  let seed = base >>> 0;
  for (let at = 0; at < index; at += 1) {
    seed = Math.floor(stream() * 0x100000000) >>> 0;
  }
  return seed >>> 0;
}

/**
 * The seeds of a station's chops, first strike first: as many as the station has completions.
 * Every entry differs, so no two strikes of the same die come out looking alike.
 */
export function chopSeedsFor(stationId: string, count: number): number[] {
  if (count <= 0) return [];
  const base = chopSeedFor(stationId);
  return Array.from({ length: count }, (_, index) =>
    index === 0 ? base : derivedSeed(base, index),
  );
}

/**
 * The seed for a station's chop: the one this device already keeps, or a new one, kept now.
 * Calling it again for the same station always gives the same answer.
 */
export function chopSeedFor(stationId: string): number {
  const known = shownThisVisit.get(stationId) ?? parseSeeds(readItem(CHOP_SEED_KEY))[stationId];
  if (known !== undefined) return known;
  const seed = drawSeed();
  shownThisVisit.set(stationId, seed);
  const kept = parseSeeds(readItem(CHOP_SEED_KEY));
  writeItem(CHOP_SEED_KEY, JSON.stringify({ ...kept, [stationId]: seed }));
  return seed;
}
