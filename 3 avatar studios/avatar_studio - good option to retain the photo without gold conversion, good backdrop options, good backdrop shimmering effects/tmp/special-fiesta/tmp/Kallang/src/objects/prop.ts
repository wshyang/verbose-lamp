/** Static event set dressing; flags/bunting sway about their top edge. */
import { drawSprite, scaledSize } from "../lib/draw";
import type { SpriteStore } from "../lib/sprites";
import type { Entity } from "../lib/types";

export interface PropConfig {
  spriteId: string; x: number; baselineY: number; width: number; layer: number;
  swayDeg?: number; swayPeriodSec?: number; phaseOffset?: number;
}

export function createProp(store: SpriteStore, cfg: PropConfig): Entity {
  const sprite = store.get(cfg.spriteId);
  const size = scaledSize(sprite.entry.width, sprite.entry.height, cfg.width);
  const swayDeg = cfg.swayDeg ?? 0;
  return {
    layer: cfg.layer,
    draw(ctx, env) {
      const rotation = swayDeg === 0 ? 0
        : Math.sin(env.timeSec * (Math.PI * 2) / (cfg.swayPeriodSec ?? 2.4) + (cfg.phaseOffset ?? 0)) * swayDeg;
      drawSprite(ctx, sprite.image, {
        x: cfg.x, y: cfg.baselineY, w: size.w, h: size.h,
        pivotX: 0.5, pivotY: 1, rotationDeg: rotation,
      });
    },
  };
}

/** Hanging decoration (bunting): pivots at its top edge. */
export function createHanging(store: SpriteStore, cfg: PropConfig): Entity {
  const sprite = store.get(cfg.spriteId);
  const size = scaledSize(sprite.entry.width, sprite.entry.height, cfg.width);
  return {
    layer: cfg.layer,
    draw(ctx, env) {
      const rotation = Math.sin(env.timeSec * 2.1 + (cfg.phaseOffset ?? 0)) * (cfg.swayDeg ?? 1.6);
      drawSprite(ctx, sprite.image, {
        x: cfg.x, y: cfg.baselineY, w: size.w, h: size.h,
        pivotX: 0.5, pivotY: 0, rotationDeg: rotation,
      });
    },
  };
}
