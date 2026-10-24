/** Composite object: kayak hull+paddler(s) stitched with a double paddle
 *  rotating about each seat's chest pivot (anchors.json, CLAUDE §12.3). */
import { cyclePhase, strokePoseAt, wrap } from "../lib/anim";
import { drawAnchorMark, drawSprite, scaledSize } from "../lib/draw";
import type { SpriteStore } from "../lib/sprites";
import type { AnchorPoint, Ctx, Entity, KayakAnchors } from "../lib/types";

export type KayakKind = "k1" | "k2" | "k3";

export interface KayakConfig {
  spriteId: string;
  kind: KayakKind;
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

export function createKayak(store: SpriteStore, anchors: KayakAnchors, cfg: KayakConfig): Entity {
  const hull = store.get(cfg.spriteId);
  const size = scaledSize(hull.entry.width, hull.entry.height, cfg.width);
  return {
    layer: cfg.layer,
    draw(ctx, env) {
      const { centreX, flip, phase } = motionAt(anchors, cfg, env.timeSec);
      drawWake(ctx, store, anchors, cfg, centreX, flip, phase);
      ctx.save();
      ctx.translate(centreX, cfg.waterlineY + Math.sin(phase * Math.PI * 4) * size.h * 0.02);
      if (flip) ctx.scale(-1, 1);
      drawSprite(ctx, hull.image, { x: 0, y: 0, w: size.w, h: size.h, pivotX: 0.5, pivotY: 1 });
      drawPaddles(ctx, store, anchors, cfg, size, phase);
      if (env.showAnchors) drawSeats(ctx, anchors, cfg, size);
      ctx.restore();
      drawDips(ctx, store, anchors, cfg, size, { centreX, flip, phase });
    },
  };
}

/** World-x of the kayak centre at time t (also used by traffic/water FX). */
export function kayakCentreXAt(cfg: KayakConfig, timeSec: number): number {
  const margin = cfg.width * 1.2;
  return wrap(cfg.startX + cfg.speedPxPerSec * timeSec, -margin, cfg.worldWidth + margin);
}

function motionAt(anchors: KayakAnchors, cfg: KayakConfig, timeSec: number) {
  return {
    centreX: kayakCentreXAt(cfg, timeSec),
    flip: cfg.speedPxPerSec > 0,
    phase: cyclePhase(timeSec, anchors.stroke.periodSec * cfg.periodScale, cfg.phaseOffset),
  };
}

function seatLocal(seat: AnchorPoint, size: Size): { x: number; y: number } {
  return { x: (seat.x - 0.5) * size.w, y: (seat.y - 1) * size.h };
}

function seatPhase(anchors: KayakAnchors, phase: number, seatIndex: number): number {
  const raw = phase + seatIndex * anchors.stroke.seatLagPhase;
  return ((raw % 1) + 1) % 1;
}

function paddleSize(store: SpriteStore, anchors: KayakAnchors, size: Size): Size {
  const paddle = store.get(anchors.paddleSprite);
  const w = anchors.paddleLengthBoatWidths * size.w;
  return { w, h: (w * paddle.entry.height) / paddle.entry.width };
}

function drawPaddles(ctx: Ctx, store: SpriteStore, anchors: KayakAnchors,
                     cfg: KayakConfig, size: Size, phase: number): void {
  const paddle = store.get(anchors.paddleSprite);
  const ps = paddleSize(store, anchors, size);
  anchors.seatsByKind[cfg.kind].forEach((seat, i) => {
    const at = seatLocal(seat, size);
    const pose = strokePoseAt(anchors.stroke.keyframes, seatPhase(anchors, phase, i));
    drawSprite(ctx, paddle.image, {
      x: at.x, y: at.y - pose.lift * ps.w * 0.5, w: ps.w, h: ps.h,
      pivotX: anchors.paddlePivot.x, pivotY: anchors.paddlePivot.y,
      rotationDeg: pose.angleDeg,
    });
  });
}

function drawSeats(ctx: Ctx, anchors: KayakAnchors, cfg: KayakConfig, size: Size): void {
  anchors.seatsByKind[cfg.kind].forEach((seat) => {
    const at = seatLocal(seat, size);
    drawAnchorMark(ctx, at.x, at.y);
  });
}

function drawWake(ctx: Ctx, store: SpriteStore, anchors: KayakAnchors,
                  cfg: KayakConfig, centreX: number, flip: boolean, phase: number): void {
  const wake = store.get(anchors.wakeSprite);
  const sternDir = flip ? -1 : 1;
  const w = cfg.width * (0.5 + 0.12 * Math.sin(phase * Math.PI * 2));
  drawSprite(ctx, wake.image, {
    x: centreX + sternDir * cfg.width * 0.48, y: cfg.waterlineY + 4,
    w, h: ((w * wake.entry.height) / wake.entry.width) * 0.5,
    pivotX: 0.5, pivotY: 0.5, flipX: !flip, alpha: 0.5,
  });
}

/** Splash at whichever blade is currently buried (the lower tip). */
function drawDips(ctx: Ctx, store: SpriteStore, anchors: KayakAnchors, cfg: KayakConfig,
                  size: Size, motion: { centreX: number; flip: boolean; phase: number }): void {
  const splash = store.get(anchors.splashSprite);
  const ps = paddleSize(store, anchors, size);
  const dirX = motion.flip ? -1 : 1;
  anchors.seatsByKind[cfg.kind].forEach((seat, i) => {
    const pose = strokePoseAt(anchors.stroke.keyframes, seatPhase(anchors, motion.phase, i));
    if (Math.abs(pose.angleDeg) < 18) return;
    const at = seatLocal(seat, size);
    const rad = (pose.angleDeg * Math.PI) / 180;
    const tipSide = pose.angleDeg > 0 ? -1 : 1; // canvas rotation: +angle lowers the left blade
    const tipLocalX = at.x + tipSide * Math.cos(rad) * ps.w * 0.5;
    const strength = Math.min(1, Math.abs(pose.angleDeg) / 32);
    const w = size.h * 0.5 * strength;
    drawSprite(ctx, splash.image, {
      x: motion.centreX + dirX * tipLocalX, y: cfg.waterlineY + size.h * 0.04,
      w, h: (w * splash.entry.height) / splash.entry.width,
      pivotX: 0.5, pivotY: 0.65, alpha: 0.35 + 0.5 * strength,
    });
  });
}
