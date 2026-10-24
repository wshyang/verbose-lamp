import { useEffect, useRef } from 'react';
import type { RgbaImage } from '../model/types';

interface ShimmerCanvasProps {
  readonly frames: readonly RgbaImage[];
  readonly label: string;
  /** Milliseconds per frame. */
  readonly frameMs?: number;
}

function paint(canvas: HTMLCanvasElement, image: RgbaImage): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  if (canvas.width !== image.width) canvas.width = image.width;
  if (canvas.height !== image.height) canvas.height = image.height;
  const pixels = context.createImageData(image.width, image.height);
  pixels.data.set(image.data);
  context.putImageData(pixels, 0, 0);
}

/** Plays precomputed shimmer phases as a ping-pong loop; still under reduced motion. */
export function ShimmerCanvas({ frames, label, frameMs = 110 }: ShimmerCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || frames.length === 0) return;
    paint(canvas, frames[0]);
    const isReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (isReduced || frames.length === 1) return;
    const cycle = frames.length * 2 - 2;
    let tick = 0;
    const timer = window.setInterval(() => {
      tick = (tick + 1) % cycle;
      paint(canvas, frames[tick < frames.length ? tick : cycle - tick]);
    }, frameMs);
    return () => window.clearInterval(timer);
  }, [frames, frameMs]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      className="h-full w-full [image-rendering:auto]"
      data-testid="avatar-studio__preview"
    />
  );
}
