import { useEffect, useRef } from 'react';
import type { RgbaImage } from './types';
import './GildedPortraitCanvas.css';

interface GildedPortraitCanvasProps {
  readonly image: RgbaImage;
  readonly label: string;
  readonly isShimmering: boolean;
  /** Lets other features reuse the canvas under their own testid convention (CLAUDE.md §5). */
  readonly testId?: string;
}

export function GildedPortraitCanvas({ image, label, isShimmering, testId = 'gilded-portrait__preview' }: GildedPortraitCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    canvas.width = image.width;
    canvas.height = image.height;
    const pixels = context.createImageData(image.width, image.height);
    pixels.data.set(image.data);
    context.putImageData(pixels, 0, 0);
  }, [image]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        className="absolute inset-0 h-full w-full object-contain"
        data-testid={testId}
      />
      {isShimmering && <span aria-hidden="true" className="gilded-portrait-sheen" />}
    </div>
  );
}