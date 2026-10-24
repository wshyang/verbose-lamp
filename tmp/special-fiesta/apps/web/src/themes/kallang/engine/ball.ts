/**
 * A loose ball on a court: shuttles between two points, bouncing.
 * Pure function of time, like every other object.
 *
 * Ported verbatim from the reference project (`tmp/Kallang/src/objects/ball.ts`, ADR-306).
 */
import { cyclePhase } from './anim.js';
import { drawSprite } from './draw.js';
import type { SpriteStore } from './sprites.js';
import type { Entity } from './types.js';
import { patrolAt } from './character.js';

export interface BallConfig {
  spriteId: string;
  x1: number;
  x2: number;
  groundY: number;
  diameter: number;
  speedPxPerSec: number;
  bounceHeight: number;
  bouncesPerSec: number;
  layer: number;
  phaseOffset: number;
}

export function createBall(store: SpriteStore, cfg: BallConfig): Entity {
  const sprite = store.get(cfg.spriteId);
  void sprite;
  return {
    layer: cfg.layer,
    draw(ctx, env) {
      const pose = patrolAt(
        { x1: cfg.x1, x2: cfg.x2, speedPxPerSec: cfg.speedPxPerSec, phaseOffset: cfg.phaseOffset },
        env.timeSec,
      );
      const bouncePhase = cyclePhase(env.timeSec, 1 / cfg.bouncesPerSec, cfg.phaseOffset);
      const hop = Math.abs(Math.sin(bouncePhase * Math.PI)) * cfg.bounceHeight;
      drawSprite(ctx, store.image(cfg.spriteId), {
        x: pose.x,
        y: cfg.groundY - hop,
        w: cfg.diameter,
        h: cfg.diameter,
        pivotX: 0.5,
        pivotY: 1,
        rotationDeg: env.timeSec * 160 * pose.direction,
      });
    },
  };
}
