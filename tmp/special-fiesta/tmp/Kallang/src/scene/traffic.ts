/** Boat traffic occupancy at time t, derived from the same pure centre-x
 *  helpers the boat modules draw with. Used by the QA watermap overlay to
 *  show where hulls/wakes are; run-time occlusion of ambient water effects
 *  is handled by y-layering in scene.ts (addendum 0006). */
import { scaledSize } from "../lib/draw";
import type { SpriteStore } from "../lib/sprites";
import { dragonCentreXAt, type DragonBoatConfig } from "../objects/dragonBoat";
import { kayakCentreXAt, type KayakConfig } from "../objects/kayak";
import type { Rect } from "./waterMap";

export type BoatSpec =
  | { kind: "dragon"; cfg: DragonBoatConfig }
  | { kind: "kayak"; cfg: KayakConfig };

/** Occupied rect (hull ∪ wake) for one boat at time t. */
export function boatRectAt(store: SpriteStore, spec: BoatSpec, timeSec: number): Rect {
  const cfg = spec.cfg;
  const entry = store.get(cfg.spriteId).entry;
  const height = scaledSize(entry.width, entry.height, cfg.width).h;
  const centreX = spec.kind === "dragon" ? dragonCentreXAt(spec.cfg, timeSec) : kayakCentreXAt(spec.cfg, timeSec);
  const sternDir = cfg.speedPxPerSec > 0 ? -1 : 1; // wake trails behind travel
  const wakeHalf = (spec.kind === "dragon" ? 0.66 : 0.5) * cfg.width * 0.5;
  const wakeCentre = centreX + sternDir * cfg.width * (spec.kind === "dragon" ? 0.55 : 0.48);
  return {
    x1: Math.min(centreX - cfg.width / 2, wakeCentre - wakeHalf),
    x2: Math.max(centreX + cfg.width / 2, wakeCentre + wakeHalf),
    y1: cfg.waterlineY - height,
    y2: cfg.waterlineY + 12,
  };
}

export function boatRectsAt(store: SpriteStore, specs: readonly BoatSpec[], timeSec: number): Rect[] {
  return specs.map((spec) => boatRectAt(store, spec, timeSec));
}
