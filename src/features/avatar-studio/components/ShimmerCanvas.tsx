import { useEffect, useRef } from 'react';
import type { RgbaImage } from '@/shared/lib/raster';

interface ShimmerCanvasProps {
  readonly frames: readonly RgbaImage[];
  readonly label: string;
  readonly testId: string;
  /** Milliseconds per frame. */
  readonly frameMs?: number;
}

function toImageData(context: CanvasRenderingContext2D, image: RgbaImage): ImageData {
  const pixels = context.createImageData(image.width, image.height);
  pixels.data.set(image.data);
  return pixels;
}

/** Plays precomputed frames as a ping-pong loop (from implementation B); still under reduced motion. */
export function ShimmerCanvas({ frames, label, testId, frameMs = 110 }: ShimmerCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || frames.length === 0) return undefined;
    canvas.width = frames[0].width;
    canvas.height = frames[0].height;
    const images = frames.map((frame) => toImageData(context, frame));
    context.putImageData(images[0], 0, 0);
    const isReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (isReduced || images.length === 1) return undefined;
    const cycle = images.length * 2 - 2;
    let tick = 0;
    const timer = window.setInterval(() => {
      tick = (tick + 1) % cycle;
      context.putImageData(images[tick < images.length ? tick : cycle - tick], 0, 0);
    }, frameMs);
    return () => window.clearInterval(timer);
  }, [frames, frameMs]);

  return <canvas ref={canvasRef} role="img" aria-label={label} className="absolute inset-0 h-full w-full" data-testid={testId} />;
}
