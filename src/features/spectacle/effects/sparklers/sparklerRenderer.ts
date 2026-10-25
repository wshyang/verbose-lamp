import { hash01 } from '@/shared/lib/random';
import type { SparklerSparkSpawn } from '../../model/sparklerPlan';

/**
 * Shared party-sparkler renderer. The standalone effect and the orb transition
 * both draw through these two functions, so "sparkler" means one thing in the
 * codebase (ADDENDUM-025 §3).
 */
export interface SparklerHeadRequest {
  ctx: CanvasRenderingContext2D;
  /** Pixel position. */
  x: number;
  y: number;
  /** Pixel radius of the white-hot core. */
  radius: number;
  /** 0..1 burn heat from `sparklerHeat`. */
  heat: number;
  /** Effect-wide fade, 0..1. */
  fade: number;
  seed: number;
  tMs: number;
  /** Number of crackle rays around the head. */
  rayCount?: number;
}

const RAY_JITTER_MS = 45;
const RAY_MIN_SCALE = 1.6;
const RAY_MAX_SCALE = 3.6;

function rayAlpha(request: SparklerHeadRequest, index: number): number {
  const tick = Math.floor(request.tMs / RAY_JITTER_MS);
  const gate = hash01(request.seed + index * 17, tick);
  return gate < 0.18 ? 0 : 0.22 + gate * 0.55;
}

function drawRays(request: SparklerHeadRequest): void {
  const { ctx, x, y, radius, heat, fade, seed } = request;
  const rays = request.rayCount ?? 14;
  for (let i = 0; i < rays; i += 1) {
    const alpha = rayAlpha(request, i) * fade;
    if (alpha < 0.02) continue;
    const wobble = hash01(seed + i * 7, Math.floor(request.tMs / 60));
    const angle = (i / rays) * Math.PI * 2 + wobble * 0.7;
    const length = radius * (RAY_MIN_SCALE + hash01(seed + i, 3) * (RAY_MAX_SCALE - RAY_MIN_SCALE)) * heat;
    const tipX = x + Math.cos(angle) * length;
    const tipY = y + Math.sin(angle) * length;
    const gradient = ctx.createLinearGradient(x, y, tipX, tipY);
    gradient.addColorStop(0, `rgba(255,246,214,${alpha})`);
    gradient.addColorStop(0.55, `rgba(255,196,92,${alpha * 0.42})`);
    gradient.addColorStop(1, 'rgba(255,150,40,0)');
    ctx.strokeStyle = gradient;
    ctx.lineWidth = Math.max(0.6, radius * 0.2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
  }
}

function drawCore(request: SparklerHeadRequest): void {
  const { ctx, x, y, radius, heat, fade } = request;
  const halos: readonly (readonly [number, string])[] = [
    [radius * 5.5, `rgba(255,128,30,${0.24 * fade * heat})`],
    [radius * 2.6, `rgba(255,186,72,${0.42 * fade * heat})`],
    [radius * 1.35, `rgba(255,238,190,${0.85 * fade * heat})`],
    [radius * 0.62, `rgba(255,255,252,${fade * heat})`],
  ];
  for (const [r, color] of halos) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(r, 0.5));
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(r, 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Bright core, warm halos and the crackling ray spray of a lit sparkler. */
export function drawSparklerHead(request: SparklerHeadRequest): void {
  if (request.heat <= 0.001 || request.fade <= 0.001) return;
  drawRays(request);
  drawCore(request);
}

/**
 * Low, warm smoke haze behind a sparkler head. `alpha` is expected pre-scaled
 * by the caller (heat × fade × plan.smoke).
 */
export function drawSparklerSmoke(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  alpha: number
): void {
  if (alpha <= 0.004) return;
  const gradient = ctx.createRadialGradient(x, y - radius, radius * 0.4, x, y, radius * 3.2);
  gradient.addColorStop(0, `rgba(255,206,140,${alpha * 0.5})`);
  gradient.addColorStop(1, 'rgba(120,90,60,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius * 3.2, 0, Math.PI * 2);
  ctx.fill();
}

/** Convert a planned spark (normalised) into the pixel units the pool uses. */
export function toPixelSpawn(
  spark: SparklerSparkSpawn,
  frame: { w: number; h: number }
): SparklerSparkSpawn & { x: number; y: number } {
  const unit = Math.min(frame.w, frame.h);
  return {
    ...spark,
    x: spark.x * frame.w,
    y: spark.y * frame.h,
    vx: spark.vx * unit,
    vy: spark.vy * unit,
    g: spark.g * unit,
    size: Math.max(0.7, spark.size * unit),
  };
}
