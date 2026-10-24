/** Render the composite lab + a 4-phase stroke strip for anchor tuning. */
import { loadAnchors } from "../src/lib/anchors";
import { createDragonBoat } from "../src/objects/dragonBoat";
import { buildLab, LAB_HEIGHT, LAB_WIDTH, renderLab } from "../src/scene/lab";
import { createCanvas, loadNodeStore, saveCanvas } from "./nodeCanvas";

const store = await loadNodeStore();
const anchors = loadAnchors();
const showAnchors = process.argv.includes("--anchors");

const lab = buildLab(store, anchors);
const canvas = createCanvas(LAB_WIDTH, LAB_HEIGHT);
renderLab(canvas.getContext("2d") as never, lab, { timeSec: 0.62, showAnchors });
await saveCanvas(canvas, showAnchors ? "qa/lab-anchors.png" : "qa/lab.png");

// Phase strip: one dragon boat at four phases of its stroke cycle.
const stripBoat = createDragonBoat(store, anchors.dragonBoat, {
  spriteId: "dragon-boat-red", waterlineY: 0, width: 1140, speedPxPerSec: 0,
  startX: 620, phaseOffset: 0, periodScale: 1, worldWidth: 1240, layer: 1,
});
const rowH = 300;
const strip = createCanvas(1240, rowH * 4 + 40);
const sctx = strip.getContext("2d");
const period = anchors.dragonBoat.stroke.periodSec;
for (let i = 0; i < 4; i += 1) {
  const phase = i * 0.25;
  sctx.fillStyle = i % 2 ? "#2b7bb4" : "#3590cf";
  sctx.fillRect(0, i * rowH, 1240, rowH);
  sctx.save();
  sctx.translate(0, i * rowH + rowH - 54);
  stripBoat.draw(sctx as never, { timeSec: phase * period, showAnchors });
  sctx.restore();
  sctx.fillStyle = "#ffffff";
  sctx.font = "bold 22px system-ui, sans-serif";
  sctx.fillText(`stroke phase ${phase.toFixed(2)}`, 18, i * rowH + 30);
}
await saveCanvas(strip, showAnchors ? "qa/lab-phase-strip-anchors.png" : "qa/lab-phase-strip.png");
