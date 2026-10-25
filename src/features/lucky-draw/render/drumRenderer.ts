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

function platePath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
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

function drawPlate(
  ctx: CanvasRenderingContext2D,
  state: DrumState,
  theta: number,
  isFront: boolean,
  w: number,
  h: number,
): void {
  const facing = Math.cos(theta);
  const cy = h / 2;
  const radius = h * 0.46;
  const plateH = ((Math.PI * 2 * radius) / PLATE_COUNT) * facing;
  const y = cy + Math.sin(theta) * radius - plateH / 2;
  const pw = w * 0.8;
  const x = (w - pw) / 2;
  const lit = 0.35 + facing * 0.65;
  const grad = ctx.createLinearGradient(0, y, 0, y + plateH);
  grad.addColorStop(0, `rgba(${120 * lit + 40},${88 * lit + 28},${34 * lit + 10},1)`);
  grad.addColorStop(0.5, `rgba(${196 * lit + 40},${150 * lit + 30},${64 * lit + 14},1)`);
  grad.addColorStop(1, `rgba(${96 * lit + 30},${70 * lit + 20},${26 * lit + 8},1)`);
  ctx.save();
  ctx.globalAlpha = Math.pow(facing, 0.6);
  if (isFront && state.landedPlateGlow) {
    ctx.shadowColor = 'rgba(255,220,130,0.9)';
    ctx.shadowBlur = 30;
  }
  platePath(ctx, x, y, pw, plateH);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(60,40,12,${0.8 * facing})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

/** Draws the 16-plate gold drum; labels relabel only on the hidden back half. */
export function drawDrum(ctx: CanvasRenderingContext2D, state: DrumState, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  const backdrop = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.7);
  backdrop.addColorStop(0, 'rgba(46,32,12,0.9)');
  backdrop.addColorStop(1, 'rgba(8,6,3,0.95)');
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, w, h);
  const order = Array.from({ length: PLATE_COUNT }, (_, i) => i)
    .map((i) => ({ i, theta: wrapHalf(i - state.position) * ((Math.PI * 2) / PLATE_COUNT) }))
    .filter((p) => Math.cos(p.theta) > 0.06)
    .sort((a, b) => Math.cos(a.theta) - Math.cos(b.theta));
  for (const p of order) {
    drawPlateWithLabel(ctx, state, p.i, p.theta, Math.abs(p.theta) < Math.PI / PLATE_COUNT, w, h);
  }
  const fog = ctx.createLinearGradient(0, 0, 0, h);
  fog.addColorStop(0, 'rgba(6,4,2,0.96)');
  fog.addColorStop(0.22, 'rgba(6,4,2,0)');
  fog.addColorStop(0.78, 'rgba(6,4,2,0)');
  fog.addColorStop(1, 'rgba(6,4,2,0.96)');
  ctx.fillStyle = fog;
  ctx.fillRect(0, 0, w, h);
}

function drawPlateWithLabel(
  ctx: CanvasRenderingContext2D,
  state: DrumState,
  plate: number,
  theta: number,
  isFront: boolean,
  w: number,
  h: number,
): void {
  drawPlate(ctx, state, theta, isFront, w, h);
  const facing = Math.cos(theta);
  const radius = h * 0.46;
  const plateH = ((Math.PI * 2 * radius) / PLATE_COUNT) * facing;
  const cy = h / 2 + Math.sin(theta) * radius;
  const entry = state.entries[plateEntryIndex(plate, state.position, state.entries.length)];
  const fitted = fitLabel(entry.name, w * 0.7, 26 * Math.max(0.55, facing), 11, (text, size) => {
    ctx.font = `600 ${size}px Cinzel, Georgia, serif`;
    return ctx.measureText(text).width;
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
  if (smear > 0.4) {
    ctx.globalAlpha = smear * 0.25 * facing;
    const sheen = ctx.createLinearGradient(0, cy - plateH / 2, 0, cy + plateH / 2);
    sheen.addColorStop(0, 'rgba(255,240,200,0)');
    sheen.addColorStop(0.5, 'rgba(255,240,200,0.8)');
    sheen.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(w * 0.1, cy - plateH / 2, w * 0.8, plateH);
  }
  ctx.restore();
}