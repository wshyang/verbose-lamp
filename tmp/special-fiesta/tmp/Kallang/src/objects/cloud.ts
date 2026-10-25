/** Drifting cloud: constant velocity, wrapped at the world edges. */
import { wrap } from "../lib/anim";
import { drawSprite, scaledSize } from "../lib/draw";
import type { SpriteStore } from "../lib/sprites";
import type { Entity } from "../lib/types";

export interface CloudConfig {
  spriteId: string; centreY: number; width: number;
  speedPxPerSec: number; startX: number; alpha: number;
  worldWidth: number; layer: number;
}

export function createCloud(store: SpriteStore, cfg: CloudConfig): Entity {
  const sprite = store.get(cfg.spriteId);
  const size = scaledSize(sprite.entry.width, sprite.entry.height, cfg.width);
  return {
    layer: cfg.layer,
    draw(ctx, env) {
      const margin = cfg.width * 0.75;
      const x = wrap(cfg.startX + cfg.speedPxPerSec * env.timeSec, -margin, cfg.worldWidth + margin);
      drawSprite(ctx, sprite.image, {
        x, y: cfg.centreY, w: size.w, h: size.h, pivotX: 0.5, pivotY: 0.5, alpha: cfg.alpha,
      });
    },
  };
}
