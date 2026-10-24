/**
 * Shared contract types for the ported scene engine (ADR-306).
 *
 * Trimmed from the reference project's `src/lib/types.ts`: the dawn/dusk manifest
 * machinery stays behind (one served plate, ADR-301); what remains is the sprite
 * store contract, the stitch-anchor geometry, and the entity interface every
 * animated object implements.
 */

export interface SpriteEntry {
  id: string;
  width: number;
  height: number;
}

/** Anything drawable by a 2D context (an <img> in the browser, a stub in tests). */
export interface SpriteImage {
  readonly width: number;
  readonly height: number;
}

export interface LoadedSprite {
  entry: SpriteEntry;
  image: SpriteImage;
}

export interface AnchorPoint {
  x: number;
  y: number;
}

export interface StrokeKeyframe {
  phase: number;
  angleDeg: number;
  lift: number;
}

export interface StrokeCycle {
  periodSec: number;
  keyframes: StrokeKeyframe[];
}

export interface DragonBoatAnchors {
  paddleSprite: string;
  paddlePivot: AnchorPoint;
  paddleLengthBoatHeights: number;
  stations: AnchorPoint[];
  stroke: StrokeCycle & { stationLagPhase: number };
  wakeSprite: string;
  splashSprite: string;
}

export interface KayakAnchors {
  paddleSprite: string;
  paddlePivot: AnchorPoint;
  paddleLengthBoatWidths: number;
  seatsByKind: Record<'k1' | 'k2' | 'k3', AnchorPoint[]>;
  stroke: StrokeCycle & { seatLagPhase: number };
  wakeSprite: string;
  splashSprite: string;
}

export interface Anchors {
  dragonBoat: DragonBoatAnchors;
  kayak: KayakAnchors;
}

export type Ctx = CanvasRenderingContext2D;

export interface RenderEnv {
  timeSec: number;
  showAnchors: boolean;
}

/** A pure function of (ctx, env): entities hold config, never mutate state. */
export interface Entity {
  layer: number;
  draw: (ctx: Ctx, env: RenderEnv) => void;
}
