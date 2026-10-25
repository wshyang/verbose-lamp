import { fitLabel } from '../model/fitLabel';
import { plateEntryIndex, wrapHalf, PLATE_COUNT } from '../model/reel';
import type { LuckyDrawEntry } from '../model/entries';

export interface DrumState {
  position: number;
  entries: readonly LuckyDrawEntry[];
  /** Slots per second, for motion smear and speed sheen. */
  speed: number;
  landedPlateGlow: boolean;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Viewport {
  w: number;
  h: number;
}

/** One visible plate: where it sits on the drum and whether it faces the viewer. */
interface PlateDraw {
  state: DrumState;
  index: number;
  theta: number;
  isFront: boolean;
  viewport: Viewport;
}

function platePath(ctx: CanvasRenderingContext2D, rect: Rect): void {
  const { x, y, w, h } = rect;
  const c = Math.min(h * 0.32, 12);
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + w - c, y);
  ctx.lineTo(x + w, y + c);
  ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h);
  ctx.lineTo(x + c, y + h);
  ctx.lineTo(x, y + h - c);
  ctx.lineTo(x, y + c);
  ctx.closePath();
}

type Rgb = readonly [number, number, number];

/**
 * A gold colour stop at light level `lit`: `base * lit + lift` per channel, as whole numbers.
 * `rgba()` channels are integers; a float is accepted by today's browsers but only by courtesy, and
 * a parser that rejects one drops the stop with no error, leaving the plate the wrong colour.
 * `lit` runs 0.35 to 1, which keeps every channel between 17 and 236, so no clamp is needed.
 */
function litGold(ramp: { base: Rgb; lift: Rgb }, lit: number): string {
  const [r, g, b] = ramp.base.map((channel, i) => Math.round(channel * lit + ramp.lift[i]));
  return `rgba(${r},${g},${b},1)`;
}

function drawPlate(ctx: CanvasRenderingContext2D, plate: PlateDraw): void {
  const { state, theta, isFront, viewport } = plate;
  const { w, h } = viewport;
  const facing = Math.cos(theta);
  const cy = h / 2;
  const radius = h * 0.46;
  const plateH = ((Math.PI * 2 * radius) / PLATE_COUNT) * facing;
  const y = cy + Math.sin(theta) * radius - plateH / 2;
  const pw = w * 0.8;
  const x = (w - pw) / 2;
  const lit = 0.35 + facing * 0.65;
  const grad = ctx.createLinearGradient(0, y, 0, y + plateH);
  grad.addColorStop(0, litGold({ base: [120, 88, 34], lift: [40, 28, 10] }, lit));
  grad.addColorStop(0.5, litGold({ base: [196, 150, 64], lift: [40, 30, 14] }, lit));
  grad.addColorStop(1, litGold({ base: [96, 70, 26], lift: [30, 20, 8] }, lit));
  ctx.save();
  ctx.globalAlpha = Math.pow(facing, 0.6);
  if (isFront && state.landedPlateGlow) {
    ctx.shadowColor = 'rgba(255,220,130,0.9)';
    ctx.shadowBlur = 30;
  }
  platePath(ctx, { x, y, w: pw, h: plateH });
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(60,40,12,${0.8 * facing})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function visiblePlates(state: DrumState, viewport: Viewport): readonly PlateDraw[] {
  return Array.from({ length: PLATE_COUNT }, (_, i) => i)
    .map((index) => ({ index, theta: wrapHalf(index - state.position) * ((Math.PI * 2) / PLATE_COUNT) }))
    .filter((p) => Math.cos(p.theta) > 0.06)
    .sort((a, b) => Math.cos(a.theta) - Math.cos(b.theta))
    .map(({ index, theta }) => ({
      state, index, theta, viewport, isFront: Math.abs(theta) < Math.PI / PLATE_COUNT,
    }));
}

/** Draws the 16-plate gold drum; labels relabel only on the hidden back half. */
export function drawDrum(ctx: CanvasRenderingContext2D, state: DrumState, viewport: Viewport): void {
  const { w, h } = viewport;
  ctx.clearRect(0, 0, w, h);
  const backdrop = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.7);
  backdrop.addColorStop(0, 'rgba(46,32,12,0.9)');
  backdrop.addColorStop(1, 'rgba(8,6,3,0.95)');
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, w, h);
  for (const plate of visiblePlates(state, viewport)) drawPlateWithLabel(ctx, plate);
  const fog = ctx.createLinearGradient(0, 0, 0, h);
  fog.addColorStop(0, 'rgba(6,4,2,0.96)');
  fog.addColorStop(0.22, 'rgba(6,4,2,0)');
  fog.addColorStop(0.78, 'rgba(6,4,2,0)');
  fog.addColorStop(1, 'rgba(6,4,2,0.96)');
  ctx.fillStyle = fog;
  ctx.fillRect(0, 0, w, h);
}

/** Vertical placement of a plate on the drum, shared by label and sheen. */
interface PlateBand {
  facing: number;
  centreY: number;
  height: number;
}

function plateBand(theta: number, h: number): PlateBand {
  const facing = Math.cos(theta);
  const radius = h * 0.46;
  return {
    facing,
    centreY: h / 2 + Math.sin(theta) * radius,
    height: ((Math.PI * 2 * radius) / PLATE_COUNT) * facing,
  };
}

function drawSpeedSheen(ctx: CanvasRenderingContext2D, band: PlateBand, view: { smear: number; w: number }): void {
  const { facing, centreY: cy, height: plateH } = band;
  ctx.globalAlpha = view.smear * 0.25 * facing;
  const sheen = ctx.createLinearGradient(0, cy - plateH / 2, 0, cy + plateH / 2);
  sheen.addColorStop(0, 'rgba(255,240,200,0)');
  sheen.addColorStop(0.5, 'rgba(255,240,200,0.8)');
  sheen.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(view.w * 0.1, cy - plateH / 2, view.w * 0.8, plateH);
}

function drawPlateWithLabel(ctx: CanvasRenderingContext2D, plate: PlateDraw): void {
  const { state, index, theta, isFront, viewport } = plate;
  const { w, h } = viewport;
  drawPlate(ctx, plate);
  const band = plateBand(theta, h);
  const { facing, centreY: cy, height: plateH } = band;
  const entry = state.entries[plateEntryIndex(index, state.position, state.entries.length)];
  const fitted = fitLabel({
    text: entry.name,
    maxWidth: w * 0.7,
    baseSize: 26 * Math.max(0.55, facing),
    minSize: 11,
    measure: (text, size) => {
      ctx.font = `600 ${size}px Cinzel, Georgia, serif`;
      return ctx.measureText(text).width;
    },
  });
  ctx.save();
  ctx.globalAlpha = Math.pow(facing, 0.8);
  ctx.font = `600 ${fitted.size}px Cinzel, Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const smear = Math.min(1, Math.abs(state.speed) / 8);
  const passes = smear > 0.15 ? 3 : 1;
  for (let j = 0; j < passes; j += 1) {
    const dy = (j - (passes - 1) / 2) * smear * plateH * 0.4;
    ctx.globalAlpha = Math.pow(facing, 0.8) * (j === 0 || passes === 1 ? 1 : 0.3);
    ctx.fillStyle = 'rgba(48,30,8,0.9)';
    ctx.fillText(fitted.text, w / 2 + 1, cy + dy + 1);
    ctx.fillStyle = isFront && state.landedPlateGlow ? '#fff2c8' : '#2c1c07';
    ctx.fillText(fitted.text, w / 2, cy + dy);
  }
  if (smear > 0.4) drawSpeedSheen(ctx, band, { smear, w });
  ctx.restore();
}
