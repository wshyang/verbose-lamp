/** Gait strip: every kit sampled at 8 phases of its stride cycle, walking
 *  right then left, so the 4-phase cycle (addendum 0007) can be inspected. */
import { KITS, createWalker } from "../src/objects/character";
import { createCanvas, loadNodeStore, saveCanvas } from "./nodeCanvas";

const store = await loadNodeStore();
const CELL_W = 170;
const CELL_H = 150;
const SAMPLES = 8;
const canvas = createCanvas(CELL_W * SAMPLES, CELL_H * KITS.length * 2);
const ctx = canvas.getContext("2d");
ctx.fillStyle = "#33475b";
ctx.fillRect(0, 0, canvas.width, canvas.height);

KITS.forEach((kit, row) => {
  for (const dir of [1, -1] as const) {
    const y = (row * 2 + (dir === 1 ? 0 : 1)) * CELL_H;
    const walker = createWalker(store, {
      kit, feetY: CELL_H - 24, height: 96, startX: CELL_W / 2,
      speedPxPerSec: 1 * dir, stridePeriodSec: 0.48, worldWidth: 100000,
      layer: 1, phaseOffset: 0,
    });
    for (let i = 0; i < SAMPLES; i += 1) {
      const x0 = i * CELL_W;
      ctx.fillStyle = i % 2 ? "#3b5269" : "#33475b";
      ctx.fillRect(x0, y, CELL_W, CELL_H);
      ctx.strokeStyle = "#ffd54a";
      ctx.beginPath();
      ctx.moveTo(x0, y + CELL_H - 24);
      ctx.lineTo(x0 + CELL_W, y + CELL_H - 24);
      ctx.stroke();
      ctx.save();
      ctx.translate(x0, y);
      walker.draw(ctx as never, { timeSec: (i / SAMPLES) * 0.48, showAnchors: false });
      ctx.restore();
      ctx.fillStyle = "#ffffff";
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillText(`${kit} ${dir === 1 ? "→" : "←"} φ${(i / SAMPLES).toFixed(2)}`, x0 + 6, y + 16);
    }
  }
});
await saveCanvas(canvas, "qa/gait-strip.png");
console.log("wrote qa/gait-strip.png");
