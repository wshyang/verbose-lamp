/** Shared contract types (CLAUDE §6: one typed contract, both sides typed). */

export interface SpriteEntry {
  id: string;
  class: string;
  url: string;
  width: number;
  height: number;
  sourceSheet: string;
  sourceBox: { x: number; y: number; w: number; h: number };
}

export interface SpriteManifest {
  sprites: SpriteEntry[];
}

/** Anything drawable by a 2D context in browser or Node (napi-canvas). */
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
  seatsByKind: Record<"k1" | "k2" | "k3", AnchorPoint[]>;
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
