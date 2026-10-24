/** People: walkers/joggers, cheerers and idlers built from the pose sheet.
 *  Locomotion is a true 4-phase gait cycle (addendum 0007): contact A ->
 *  passing -> contact B -> passing, using every motion phase the sheet
 *  contains. For red/blue/green/yellow the two contacts are run-right and
 *  run-left-mirrored (pixel-distinct strides); orange/purple additionally
 *  have run-side phases as the passing poses. Bob is phase-locked so feet
 *  plant at contact centres instead of hovering mid-stride. */
import { cyclePhase, polylineYAt, wrap } from "../lib/anim";
import { drawSprite, scaledSize } from "../lib/draw";
import type { SpriteStore } from "../lib/sprites";
import type { Ctx, Entity } from "../lib/types";

export type Kit = "red" | "blue" | "green" | "yellow" | "orange" | "purple";
export const KITS: readonly Kit[] = ["red", "blue", "green", "yellow", "orange", "purple"];

const RICH_KITS: ReadonlySet<Kit> = new Set(["orange", "purple"]);

/** One gait frame. `mirror` marks art that natively faces LEFT; the frame
 *  is flipped to face right logically, then flipped again for leftward
 *  travel (flip = movingLeft XOR mirror). */
export interface GaitFrame { poseId: string; mirror: boolean }

export function gaitFrames(kit: Kit): readonly GaitFrame[] {
  return RICH_KITS.has(kit)
    ? [
        { poseId: `char-${kit}-run-right-a`, mirror: false },
        { poseId: `char-${kit}-run-side-right`, mirror: false },
        { poseId: `char-${kit}-run-right-b`, mirror: false },
        { poseId: `char-${kit}-run-side-left`, mirror: true },
      ]
    : [
        { poseId: `char-${kit}-run-right`, mirror: false },
        { poseId: `char-${kit}-side-right`, mirror: false },
        { poseId: `char-${kit}-run-left`, mirror: true },
        { poseId: `char-${kit}-side-right`, mirror: false },
      ];
}

export interface GaitPose {
  frameIndex: number;
  /** Vertical offset in px (negative = up). 0 at contact-frame centres
   *  (phases .125/.625), max lift at passing centres (.375/.875). */
  bobPx: number;
  /** Forward body-rock in degrees (positive = leaning into travel). */
  leanDeg: number;
}

export function gaitAt(stepPhase: number, height: number, bobAmpFrac: number): GaitPose {
  const frameIndex = Math.floor(stepPhase * 4) % 4;
  const lift = 0.5 - 0.5 * Math.cos((stepPhase - 0.125) * Math.PI * 4);
  return {
    frameIndex,
    bobPx: -lift * bobAmpFrac * height,
    leanDeg: Math.sin(stepPhase * Math.PI * 4) * 2.1,
  };
}

/** Bob amplitude grows with speed: strollers stay grounded, joggers bounce. */
export function bobAmpForSpeed(speedPxPerSec: number): number {
  const s = Math.abs(speedPxPerSec);
  if (s >= 90) return 0.06;
  if (s >= 55) return 0.045;
  return 0.03;
}

function cheerFrames(kit: Kit): [string, string] {
  return RICH_KITS.has(kit)
    ? [`char-${kit}-celebrate-front`, `char-${kit}-wave`]
    : [`char-${kit}-celebrate-front`, `char-${kit}-cheer-front`];
}

function drawPose(ctx: Ctx, store: SpriteStore, poseId: string, x: number, feetY: number,
                  height: number, flip: boolean, rotationDeg = 0): void {
  const sprite = store.get(poseId);
  const size = scaledSize(sprite.entry.width, sprite.entry.height,
    (height * sprite.entry.width) / sprite.entry.height);
  drawSprite(ctx, sprite.image, {
    x, y: feetY, w: size.w, h: height, pivotX: 0.5, pivotY: 1, flipX: flip, rotationDeg,
  });
}

/** Draw the gait frame for this phase, facing travel direction. The lean
 *  sign is resolved through the flip so it always rocks into travel. */
function drawGait(ctx: Ctx, store: SpriteStore, frames: readonly GaitFrame[],
                  pose: GaitPose, x: number, feetY: number, height: number,
                  movingLeft: boolean): void {
  const frame = frames[pose.frameIndex];
  if (frame === undefined) throw new Error(`gait frame ${pose.frameIndex} out of range`);
  const flip = movingLeft !== frame.mirror;
  const worldLean = movingLeft ? -pose.leanDeg : pose.leanDeg;
  drawPose(ctx, store, frame.poseId, x, feetY + pose.bobPx, height, flip,
    flip ? -worldLean : worldLean);
}

export type PathPoint = readonly [x: number, feetY: number];

export interface WalkerConfig {
  kit: Kit; feetY: number; height: number; startX: number;
  speedPxPerSec: number; stridePeriodSec: number; worldWidth: number;
  layer: number; phaseOffset: number;
  /** Optional sloped path: feetY interpolated from x along these points. */
  path?: readonly PathPoint[];
}

export function pathYAt(path: readonly PathPoint[], x: number): number {
  return polylineYAt(path, x);
}

export function createWalker(store: SpriteStore, cfg: WalkerConfig): Entity {
  const frames = gaitFrames(cfg.kit);
  const movingLeft = cfg.speedPxPerSec < 0;
  const bobAmp = bobAmpForSpeed(cfg.speedPxPerSec);
  return {
    layer: cfg.layer,
    draw(ctx, env) {
      const x = wrap(cfg.startX + cfg.speedPxPerSec * env.timeSec, -90, cfg.worldWidth + 90);
      const stepPhase = cyclePhase(env.timeSec, cfg.stridePeriodSec, cfg.phaseOffset);
      const feetY = cfg.path ? pathYAt(cfg.path, x) : cfg.feetY;
      drawGait(ctx, store, frames, gaitAt(stepPhase, cfg.height, bobAmp), x, feetY, cfg.height, movingLeft);
    },
  };
}

export interface CheererConfig {
  kit: Kit; x: number; feetY: number; height: number; layer: number; phaseOffset: number;
}

export function createCheerer(store: SpriteStore, cfg: CheererConfig): Entity {
  const [frameA, frameB] = cheerFrames(cfg.kit);
  return {
    layer: cfg.layer,
    draw(ctx, env) {
      const phase = cyclePhase(env.timeSec, 0.72, cfg.phaseOffset);
      const hop = -Math.sin(phase * Math.PI) * cfg.height * 0.05;
      drawPose(ctx, store, phase < 0.5 ? frameA : frameB, cfg.x, cfg.feetY + hop, cfg.height, false);
    },
  };
}

export interface IdlerConfig {
  kit: Kit; x: number; feetY: number; height: number; layer: number; periodSec: number; phaseOffset: number;
}

export function createIdler(store: SpriteStore, cfg: IdlerConfig): Entity {
  const gesture = RICH_KITS.has(cfg.kit) ? `char-${cfg.kit}-wave` : `char-${cfg.kit}-reach-right`;
  const idle = `char-${cfg.kit}-idle-front`;
  return {
    layer: cfg.layer,
    draw(ctx, env) {
      const phase = cyclePhase(env.timeSec, cfg.periodSec, cfg.phaseOffset);
      const pose = phase < 0.16 ? gesture : idle;
      const sway = Math.sin(env.timeSec * 1.7 + cfg.phaseOffset * 9) * 1.1;
      drawPose(ctx, store, pose, cfg.x + sway, cfg.feetY, cfg.height, false);
    },
  };
}

export interface PatrolConfig {
  kit: Kit; x1: number; x2: number; feetY: number; height: number;
  speedPxPerSec: number; stridePeriodSec: number; layer: number; phaseOffset: number;
}

export interface PatrolPose { x: number; direction: 1 | -1 }

/** Ping-pong between x1 and x2 at constant speed (court shuttles). Pure. */
export function patrolAt(cfg: Pick<PatrolConfig, "x1" | "x2" | "speedPxPerSec" | "phaseOffset">,
                         timeSec: number): PatrolPose {
  const span = Math.abs(cfg.x2 - cfg.x1);
  if (span === 0 || cfg.speedPxPerSec === 0) return { x: cfg.x1, direction: 1 };
  const period = (2 * span) / Math.abs(cfg.speedPxPerSec);
  const phase = cyclePhase(timeSec, period, cfg.phaseOffset);
  const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2;
  return { x: cfg.x1 + tri * (cfg.x2 - cfg.x1), direction: phase < 0.5 ? 1 : -1 };
}

export function createPatrol(store: SpriteStore, cfg: PatrolConfig): Entity {
  const frames = gaitFrames(cfg.kit);
  const bobAmp = bobAmpForSpeed(cfg.speedPxPerSec);
  return {
    layer: cfg.layer,
    draw(ctx, env) {
      const pose = patrolAt(cfg, env.timeSec);
      const stepPhase = cyclePhase(env.timeSec, cfg.stridePeriodSec, cfg.phaseOffset);
      const facesRight = (cfg.x2 >= cfg.x1) === (pose.direction === 1);
      drawGait(ctx, store, frames, gaitAt(stepPhase, cfg.height, bobAmp),
        pose.x, cfg.feetY, cfg.height, !facesRight);
    },
  };
}
