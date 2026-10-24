/** Render full-scene stills at chosen times (defaults 2s and 6.5s).
 *  Flags: --theme=<dawn|morning|day|evening|dusk> (layered backdrop),
 *  --grid (world-coordinate grid), --watermap (shoreline/pontoon/
 *  promenade/courts/effect-placement/boat-rect overlay for layout proof). */
import { loadAnchors } from "../src/lib/anchors";
import type { Ctx } from "../src/lib/types";
import {
  BOARDWALK, computeSceneView, COURTS, PROMENADE_BACK, PROMENADE_FRONT, backdropTheme,
  boatSpecs, buildScene, renderScene, waterEffectPlacements, WORLD_HEIGHT, WORLD_WIDTH,
} from "../src/scene/scene";
import { boatRectsAt } from "../src/scene/traffic";
import { DOCK_RECT, PONTOON_RECT, SHORELINE, type Rect } from "../src/scene/waterMap";
import { createCanvas, loadBackdrop, loadNodeStore, saveCanvas } from "./nodeCanvas";

const SEED = 20261017;
const themeArg = process.argv.find((a) => a.startsWith("--theme="))?.split("=")[1] ?? "day";
const store = await loadNodeStore(backdropTheme(themeArg).spriteVariant);
const anchors = loadAnchors();
const backdrop = await loadBackdrop(themeArg);
const entities = buildScene(store, anchors, SEED);
const withGrid = process.argv.includes("--grid");
const withWatermap = process.argv.includes("--watermap");
const aspectArg = process.argv.find((a) => a.startsWith("--aspect="))?.split("=")[1];
const view = aspectArg ? computeSceneView(Number(aspectArg)) : undefined;
const times = [2, 6.5];

for (const t of times) {
  const canvas = createCanvas(view?.width ?? WORLD_WIDTH, WORLD_HEIGHT);
  const ctx = canvas.getContext("2d");
  renderScene(ctx as never, backdrop, entities, { timeSec: t, showAnchors: false }, view);
  if (withGrid) drawGrid(ctx as never);
  if (withWatermap) drawWatermap(ctx as never, t);
  const suffix = `${themeArg !== "day" ? `-${themeArg}` : ""}${aspectArg ? `-a${aspectArg.replace(".", "_")}` : ""}${withWatermap ? "-watermap" : withGrid ? "-grid" : ""}`;
  await saveCanvas(canvas, `qa/scene-t${String(t).replace(".", "_")}${suffix}.png`);
}

function drawGrid(ctx: Ctx): void {
  ctx.strokeStyle = "rgba(255,0,0,0.35)";
  ctx.fillStyle = "rgba(255,0,0,0.8)";
  ctx.font = "bold 20px system-ui, sans-serif";
  for (let x = 0; x <= WORLD_WIDTH; x += 200) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_HEIGHT); ctx.stroke();
    ctx.fillText(String(x), x + 4, 24);
  }
  for (let y = 0; y <= WORLD_HEIGHT; y += 100) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD_WIDTH, y); ctx.stroke();
    ctx.fillText(String(y), 6, y + 22);
  }
}

function strokePolyline(ctx: Ctx, points: ReadonlyArray<readonly [number, number]>, style: string, width: number): void {
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
}

function strokeRect(ctx: Ctx, rect: Rect, style: string, width: number): void {
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.strokeRect(rect.x1, rect.y1, rect.x2 - rect.x1, rect.y2 - rect.y1);
}

function drawWatermap(ctx: Ctx, t: number): void {
  strokePolyline(ctx, SHORELINE, "#22d3ee", 5); // cyan: water's top edge
  strokeRect(ctx, PONTOON_RECT, "#f43f5e", 4); // red: excluded deck
  strokeRect(ctx, DOCK_RECT, "#f43f5e", 4);
  strokePolyline(ctx, PROMENADE_FRONT, "#facc15", 4); // yellow: corrected paths
  strokePolyline(ctx, PROMENADE_BACK, "#facc15", 3);
  strokePolyline(ctx, [[BOARDWALK.x1, BOARDWALK.feetY], [BOARDWALK.x2, BOARDWALK.feetY]], "#facc15", 4);
  strokeRect(ctx, COURTS.futsal, "#4ade80", 4); // green: ball courts
  strokeRect(ctx, COURTS.basketball, "#4ade80", 4);
  ctx.fillStyle = "#e879f9"; // magenta: sprinkled effect placements
  for (const point of waterEffectPlacements(SEED)) {
    ctx.beginPath(); ctx.arc(point.x, point.y, 9, 0, Math.PI * 2); ctx.fill();
  }
  for (const rect of boatRectsAt(store, boatSpecs(), t)) strokeRect(ctx, rect, "#fb923c", 3); // orange: traffic
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 26px system-ui, sans-serif";
  ctx.fillText("cyan=shoreline  red=excluded deck/dock  yellow=promenade/boardwalk paths  green=courts  magenta=water FX  orange=boat traffic", 30, 40);
}
