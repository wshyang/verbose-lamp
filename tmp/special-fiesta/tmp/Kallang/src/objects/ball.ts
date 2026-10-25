/** A loose ball on a court: shuttles between two points, bouncing.
 *  Pure function of time, like every other object (CLAUDE §12.4). */
import { cyclePhase } from "../lib/anim";
import { drawSprite } from "../lib/draw";
import type { SpriteStore } from "../lib/sprites";
import type { Entity } from "../lib/types";
import { patrolAt } from "./character";

export interface BallConfig {
  spriteId: string; x1: number; x2: number; groundY: number;
  diameter: number; speedPxPerSec: number; bounceHeight: number;
  bouncesPerSec: number; layer: number; phaseOffset: number;
}

export function createBall(store: SpriteStore, cfg: BallConfig): Entity {
  const sprite = store.get(cfg.spriteId);
  return {
    layer: cfg.layer,
    draw(ctx, env) {
      const pose = patrolAt(
        { x1: cfg.x1, x2: cfg.x2, speedPxPerSec: cfg.speedPxPerSec, phaseOffset: cfg.phaseOffset },
        env.timeSec);
      const bouncePhase = cyclePhase(env.timeSec, 1 / cfg.bouncesPerSec, cfg.phaseOffset);
      const hop = Math.abs(Math.sin(bouncePhase * Math.PI)) * cfg.bounceHeight;
      drawSprite(ctx, sprite.image, {
        x: pose.x, y: cfg.groundY - hop, w: cfg.diameter, h: cfg.diameter,
        pivotX: 0.5, pivotY: 1, rotationDeg: env.timeSec * 160 * pose.direction,
      });
    },
  };
}
