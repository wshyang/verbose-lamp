/** Composite object: dragon boat hull+crew stitched with loose paddles.
 *  All stitch geometry comes from anchors.json (CLAUDE §12.3); every draw is
 *  a pure function of (config, time) so QA stills match the browser. */
import { bladeTip, cyclePhase, strokePoseAt, wrap } from "../lib/anim";
import { drawAnchorMark, drawSprite, scaledSize } from "../lib/draw";
import type { SpriteStore } from "../lib/sprites";
import type { Ctx, DragonBoatAnchors, Entity } from "../lib/types";

export interface DragonBoatConfig {
  spriteId: string;
  waterlineY: number;
  width: number;
  speedPxPerSec: number; // negative = bow-first leftward (the art faces left)
  startX: number;
  phaseOffset: number;
  periodScale: number;
  worldWidth: number;
  layer: number;
}

interface Size { w: number; h: number }

interface Frame {
  centreX: number;
  flip: boolean;
  phase: number;
  bobY: number;
}

export function createDragonBoat(store: SpriteStore, anchors: DragonBoatAnchors, cfg: DragonBoatConfig): Entity {
  const hull = store.get(cfg.spriteId);
  const size = scaledSize(hull.entry.width, hull.entry.height, cfg.width);
  return {
    layer: cfg.layer,
    draw(ctx, env) {
      const frame = frameAt(anchors, cfg, size, env.timeSec);
      drawWake(ctx, store, anchors, cfg, frame);
      drawBoat(ctx, store, anchors, cfg, size, frame, env.showAnchors);
      drawSplashes(ctx, store, anchors, cfg, size, frame);
    },
  };
}

/** World-x of the boat centre at time t (also used by traffic/water FX). */
export function dragonCentreXAt(cfg: DragonBoatConfig, timeSec: number): number {
  const margin = cfg.width * 1.15;
  return wrap(cfg.startX + cfg.speedPxPerSec * timeSec, -margin, cfg.worldWidth + margin);
}

export function frameAt(anchors: DragonBoatAnchors, cfg: DragonBoatConfig, size: Size, timeSec: number): Frame {
  const phase = cyclePhase(timeSec, anchors.stroke.periodSec * cfg.periodScale, cfg.phaseOffset);
  return {
    centreX: dragonCentreXAt(cfg, timeSec),
    flip: cfg.speedPxPerSec > 0,
    phase,
    bobY: Math.sin((phase + 0.12) * Math.PI * 2) * size.h * 0.016,
  };
}

function drawBoat(ctx: Ctx, store: SpriteStore, anchors: DragonBoatAnchors,
                  cfg: DragonBoatConfig, size: Size, frame: Frame, showAnchors: boolean): void {
  ctx.save();
  ctx.translate(frame.centreX, cfg.waterlineY + frame.bobY);
  if (frame.flip) ctx.scale(-1, 1);
  drawSprite(ctx, store.image(cfg.spriteId), { x: 0, y: 0, w: size.w, h: size.h, pivotX: 0.5, pivotY: 1 });
  drawPaddles(ctx, store, anchors, size, frame.phase);
  if (showAnchors) forEachStation(anchors, size, (at) => drawAnchorMark(ctx, at.x, at.y));
  ctx.restore();
}

function stationLocal(anchors: DragonBoatAnchors, size: Size, index: number): { x: number; y: number } {
  const station = anchors.stations[index];
  if (station === undefined) throw new Error(`station ${index} out of range`);
  return { x: (station.x - 0.5) * size.w, y: (station.y - 1) * size.h };
}

function forEachStation(anchors: DragonBoatAnchors, size: Size, fn: (at: { x: number; y: number }, i: number) => void): void {
  anchors.stations.forEach((_, i) => fn(stationLocal(anchors, size, i), i));
}

function stationPhase(anchors: DragonBoatAnchors, phase: number, index: number): number {
  const raw = phase + index * anchors.stroke.stationLagPhase;
  return ((raw % 1) + 1) % 1;
}

function drawPaddles(ctx: Ctx, store: SpriteStore, anchors: DragonBoatAnchors, size: Size, phase: number): void {
  const paddle = store.get(anchors.paddleSprite);
  const length = anchors.paddleLengthBoatHeights * size.h;
  const width = (length * paddle.entry.width) / paddle.entry.height;
  forEachStation(anchors, size, (at, i) => {
    const pose = strokePoseAt(anchors.stroke.keyframes, stationPhase(anchors, phase, i));
    drawSprite(ctx, paddle.image, {
      x: at.x, y: at.y - pose.lift * length, w: width, h: length,
      pivotX: anchors.paddlePivot.x, pivotY: anchors.paddlePivot.y,
      rotationDeg: pose.angleDeg,
    });
  });
}

function drawWake(ctx: Ctx, store: SpriteStore, anchors: DragonBoatAnchors,
                  cfg: DragonBoatConfig, frame: Frame): void {
  const wake = store.get(anchors.wakeSprite);
  const sternDir = frame.flip ? -1 : 1; // stern is opposite the bow's travel
  const pulse = 0.92 + 0.22 * Math.sin(frame.phase * Math.PI * 2);
  const w = cfg.width * 0.66 * pulse;
  const h = (w * wake.entry.height) / wake.entry.width;
  drawSprite(ctx, wake.image, {
    x: frame.centreX + sternDir * cfg.width * 0.55, y: cfg.waterlineY + 6,
    w, h: h * 0.5, pivotX: 0.5, pivotY: 0.5, flipX: !frame.flip, alpha: 0.55,
  });
}

function drawSplashes(ctx: Ctx, store: SpriteStore, anchors: DragonBoatAnchors,
                      cfg: DragonBoatConfig, size: Size, frame: Frame): void {
  const splash = store.get(anchors.splashSprite);
  const length = anchors.paddleLengthBoatHeights * size.h;
  const dirX = frame.flip ? -1 : 1;
  forEachStation(anchors, size, (at, i) => {
    const local = stationPhase(anchors, frame.phase, i);
    if (local > 0.14) return; // splash only as the blade bites (catch)
    const pose = strokePoseAt(anchors.stroke.keyframes, local);
    const tip = bladeTip(pose.angleDeg, length * (1 - anchors.paddlePivot.y));
    const strength = 1 - local / 0.14;
    const w = size.h * 0.3 * (0.6 + 0.4 * strength);
    drawSprite(ctx, splash.image, {
      x: frame.centreX + dirX * (at.x + tip.x), y: cfg.waterlineY + size.h * 0.04,
      w, h: (w * splash.entry.height) / splash.entry.width,
      pivotX: 0.5, pivotY: 0.65, alpha: 0.3 + 0.65 * strength,
    });
  });
}
