/** Mapped water boundaries of the Kallang backdrop (world px, 2752x1536),
 *  measured on grid overlays (qa/measure-waterfront-*.png). Open water sits
 *  below the shoreline polyline, excluding the lower boardwalk/pontoon and
 *  the small blue floating dock. Used to place ambient water effects so
 *  they can never land on shore, deck, or dock. */
import { polylineYAt } from "../lib/anim";
import type { Rng } from "../lib/rng";

export interface Rect { x1: number; y1: number; x2: number; y2: number }

/** Water's top edge. Left: grass-bank shoreline sloping down; centre: the
 *  wall base in front of the promenade; right: the boardwalk front edge. */
export const SHORELINE: ReadonlyArray<readonly [number, number]> = [
  [0, 1195], [300, 1212], [600, 1228], [700, 1258], [1100, 1262],
  [1380, 1268], [1420, 1300], [2620, 1302], [2752, 1312],
];

/** Lower wooden boardwalk + its gangways (x 1375-2630). */
export const PONTOON_RECT: Rect = { x1: 1375, y1: 1252, x2: 2630, y2: 1306 };

/** Small blue floating dock against the centre wall. */
export const DOCK_RECT: Rect = { x1: 600, y1: 1218, x2: 930, y2: 1258 };

export const WATER_BOTTOM = 1526;
export const WATER_LEFT = 8;
export const WATER_RIGHT = 2744;

export function shorelineYAt(x: number): number {
  return polylineYAt(SHORELINE, x);
}

function insideRect(x: number, y: number, rect: Rect, pad: number): boolean {
  return x >= rect.x1 - pad && x <= rect.x2 + pad && y >= rect.y1 - pad && y <= rect.y2 + pad;
}

/** True when (x, y) is on open water, at least `margin` px from any edge. */
export function isOpenWater(x: number, y: number, margin = 14): boolean {
  if (x < WATER_LEFT + margin || x > WATER_RIGHT - margin) return false;
  if (y > WATER_BOTTOM - margin * 0.5) return false;
  if (y < shorelineYAt(x) + margin) return false;
  if (insideRect(x, y, PONTOON_RECT, margin)) return false;
  if (insideRect(x, y, DOCK_RECT, margin)) return false;
  return true;
}

export interface WaterPoint { x: number; y: number }

/** Seeded-random open-water placements (rejection sampling, deterministic
 *  for a given RNG state): inside the water map, mutually separated. */
export function placeWaterEffects(rng: Rng, count: number, minSeparation = 135): WaterPoint[] {
  const placed: WaterPoint[] = [];
  for (let attempt = 0; attempt < count * 80 && placed.length < count; attempt += 1) {
    const candidate = sampleCandidate(rng);
    if (!isOpenWater(candidate.x, candidate.y)) continue;
    if (placed.some((p) => Math.hypot(p.x - candidate.x, p.y - candidate.y) < minSeparation)) continue;
    placed.push(candidate);
  }
  return placed;
}

function sampleCandidate(rng: Rng): WaterPoint {
  const x = rng.range(WATER_LEFT + 24, WATER_RIGHT - 24);
  const top = shorelineYAt(x) + 20;
  return { x, y: rng.range(top, WATER_BOTTOM - 8) };
}
