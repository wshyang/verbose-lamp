/** Composite stitch-point data (src/generated/anchors.json) — single source
 *  read by the TS app, the Node QA renderer, and tuning tooling. */
import anchorsJson from "../generated/anchors.json";
import type { Anchors } from "./types";

export function loadAnchors(): Anchors {
  const anchors = anchorsJson as Anchors;
  validateAnchors(anchors);
  return anchors;
}

function validateAnchors(anchors: Anchors): void {
  for (const station of anchors.dragonBoat.stations) assertFraction(station.x, "station.x");
  for (const seats of Object.values(anchors.kayak.seatsByKind)) {
    for (const seat of seats) assertFraction(seat.x, "seat.x");
  }
  if (anchors.dragonBoat.stroke.keyframes.length < 2) {
    throw new Error("dragon boat stroke needs at least 2 keyframes");
  }
}

function assertFraction(value: number, label: string): void {
  if (value < 0 || value > 1) throw new Error(`${label} must be a 0-1 fraction, got ${value}`);
}
