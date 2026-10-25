/** Canvas draw helpers: one anchored-sprite primitive used everywhere. */
import type { Ctx, SpriteImage } from "./types";

export interface DrawSpriteOptions {
  x: number;
  y: number;
  w: number;
  h: number;
  pivotX?: number;
  pivotY?: number;
  rotationDeg?: number;
  flipX?: boolean;
  alpha?: number;
}

/** Draw `image` so its pivot (fractions, default centre-bottom) sits at x,y. */
export function drawSprite(ctx: Ctx, image: SpriteImage, opts: DrawSpriteOptions): void {
  const pivotX = opts.pivotX ?? 0.5;
  const pivotY = opts.pivotY ?? 1;
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.translate(opts.x, opts.y);
  if (opts.rotationDeg) ctx.rotate((opts.rotationDeg * Math.PI) / 180);
  if (opts.flipX) ctx.scale(-1, 1);
  ctx.drawImage(image as CanvasImageSource, -pivotX * opts.w, -pivotY * opts.h, opts.w, opts.h);
  ctx.restore();
}

export function scaledSize(naturalWidth: number, naturalHeight: number, targetWidth: number) {
  return { w: targetWidth, h: (targetWidth * naturalHeight) / naturalWidth };
}

export function drawAnchorMark(ctx: Ctx, x: number, y: number): void {
  ctx.save();
  ctx.strokeStyle = "#ff2a2a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.moveTo(x - 11, y);
  ctx.lineTo(x + 11, y);
  ctx.moveTo(x, y - 11);
  ctx.lineTo(x, y + 11);
  ctx.stroke();
  ctx.restore();
}
