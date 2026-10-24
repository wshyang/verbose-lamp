/** Ambient water effects (ripples and small splashes) sprinkled on the bay.
 *  Positions come from the water map (open water only). Effects are layered
 *  by their y (scene.ts: layerForWaterEffect) just behind the boat lane in
 *  front of them, so hulls occlude them naturally instead of them being
 *  faded out wholesale (addendum 0006). */
import { cyclePhase } from "../lib/anim";
import { drawSprite, scaledSize } from "../lib/draw";
import type { SpriteStore } from "../lib/sprites";
import type { Entity } from "../lib/types";

export interface RippleConfig {
  spriteId: string; x: number; y: number; width: number;
  periodSec: number; phaseOffset: number; layer: number;
}

export function createRipple(store: SpriteStore, cfg: RippleConfig): Entity {
  const sprite = store.get(cfg.spriteId);
  return {
    layer: cfg.layer,
    draw(ctx, env) {
      const phase = cyclePhase(env.timeSec, cfg.periodSec, cfg.phaseOffset);
      const scale = 0.75 + 0.5 * phase;
      const alpha = 0.95 * (1 - phase * phase);
      if (alpha <= 0.02) return;
      const size = scaledSize(sprite.entry.width, sprite.entry.height, cfg.width * scale);
      drawSprite(ctx, sprite.image, {
        x: cfg.x, y: cfg.y, w: size.w, h: size.h, pivotX: 0.5, pivotY: 0.5, alpha,
      });
    },
  };
}
