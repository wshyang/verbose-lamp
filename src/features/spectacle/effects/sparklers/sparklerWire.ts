import type { WandGeometry } from './sparklerWand';

export interface SparklerWireRequest {
  ctx: CanvasRenderingContext2D;
  geometry: WandGeometry;
  /** Viewport scale; 1 at 700 px on the short side. */
  scale: number;
  /** Effect-wide fade, 0..1. */
  fade: number;
}

const MIN_FADE = 0.001;
const WIRE_WIDTH = 3.2;
const SHINE_WIDTH = 1;
const COATING_WIDTH = 5;

/** The wire a party sparkler is held by: dark steel, a pale highlight, and the glowing coated end. */
export function drawSparklerWire({ ctx, geometry, scale, fade }: SparklerWireRequest): void {
  if (fade <= MIN_FADE) return;
  const { handle, burnFront, tip } = geometry;
  ctx.lineCap = 'round';

  ctx.strokeStyle = `rgba(42,38,34,${0.94 * fade})`;
  ctx.lineWidth = Math.max(2, WIRE_WIDTH * scale);
  ctx.beginPath();
  ctx.moveTo(handle.x, handle.y);
  ctx.lineTo(burnFront.x, burnFront.y);
  ctx.stroke();

  ctx.strokeStyle = `rgba(218,211,196,${0.62 * fade})`;
  ctx.lineWidth = Math.max(1, SHINE_WIDTH * scale);
  ctx.beginPath();
  ctx.moveTo(handle.x, handle.y - scale);
  ctx.lineTo(burnFront.x, burnFront.y - scale);
  ctx.stroke();

  const coating = ctx.createLinearGradient(burnFront.x, burnFront.y, tip.x, tip.y);
  coating.addColorStop(0, `rgba(74,42,24,${0.95 * fade})`);
  coating.addColorStop(0.72, `rgba(190,82,24,${0.96 * fade})`);
  coating.addColorStop(1, `rgba(255,205,105,${fade})`);
  ctx.strokeStyle = coating;
  ctx.lineWidth = Math.max(3, COATING_WIDTH * scale);
  ctx.beginPath();
  ctx.moveTo(burnFront.x, burnFront.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();
}
