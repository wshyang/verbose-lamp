/** Composite lab (spec §4): boats at reading size on plain water bands so
 *  paddle stitching can be inspected and anchor-tuned. Static positions,
 *  live stroke cycles; optional anchor crosshairs. */
import type { SpriteStore } from "../lib/sprites";
import type { Anchors, Ctx, Entity, RenderEnv } from "../lib/types";
import { createDragonBoat } from "../objects/dragonBoat";
import { createKayak } from "../objects/kayak";

export const LAB_WIDTH = 1600;
export const LAB_HEIGHT = 1040;

export function buildLab(store: SpriteStore, anchors: Anchors): Entity[] {
  const parked = { speedPxPerSec: 0, worldWidth: LAB_WIDTH };
  const boats: Entity[] = [
    createDragonBoat(store, anchors.dragonBoat, {
      ...parked, spriteId: "dragon-boat-red", waterlineY: 330, width: 1140,
      startX: 800, phaseOffset: 0, periodScale: 1, layer: 10,
    }),
    createDragonBoat(store, anchors.dragonBoat, {
      ...parked, spriteId: "dragon-boat-blue", waterlineY: 545, width: 900,
      startX: 700, phaseOffset: 0.3, periodScale: 1, layer: 10,
    }),
    createKayak(store, anchors.kayak, {
      ...parked, spriteId: "kayak-purple-k3-a", kind: "k3", waterlineY: 735, width: 470,
      startX: 290, phaseOffset: 0.1, periodScale: 1, layer: 10,
    }),
    createKayak(store, anchors.kayak, {
      ...parked, spriteId: "kayak-green-k2-a", kind: "k2", waterlineY: 735, width: 470,
      startX: 810, phaseOffset: 0.45, periodScale: 1, layer: 10,
    }),
    createKayak(store, anchors.kayak, {
      ...parked, spriteId: "kayak-red-k1-a", kind: "k1", waterlineY: 735, width: 430,
      startX: 1310, phaseOffset: 0.7, periodScale: 1, layer: 10,
    }),
    createKayak(store, anchors.kayak, {
      ...parked, spriteId: "kayak-yellow-k1-a", kind: "k1", waterlineY: 930, width: 430,
      speedPxPerSec: 0.001, startX: 420, phaseOffset: 0.2, periodScale: 1, layer: 10,
    }),
    createDragonBoat(store, anchors.dragonBoat, {
      ...parked, spriteId: "dragon-boat-orange", waterlineY: 950, width: 760,
      speedPxPerSec: 0.001, startX: 1130, phaseOffset: 0.55, periodScale: 1, layer: 10,
    }),
  ];
  return boats;
}

export function renderLab(ctx: Ctx, entities: readonly Entity[], env: RenderEnv): void {
  ctx.imageSmoothingEnabled = false;
  const gradient = ctx.createLinearGradient(0, 0, 0, LAB_HEIGHT);
  gradient.addColorStop(0, "#8ec9e8");
  gradient.addColorStop(0.42, "#3f8fbf");
  gradient.addColorStop(1, "#14507c");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, LAB_WIDTH, LAB_HEIGHT);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "bold 30px system-ui, sans-serif";
  ctx.fillText("Composite lab — boats stitched with loose paddles", 28, 46);
  ctx.font = "20px system-ui, sans-serif";
  ctx.fillText("Dragon boat (near-natural size)", 28, 132);
  ctx.fillText("Dragon boat, mid phase offset", 28, 412);
  ctx.fillText("Kayaks K3 · K2 · K1", 28, 630);
  ctx.fillText("Mirrored travel check (flipped composites)", 28, 838);
  for (const entity of entities) entity.draw(ctx, env);
}
