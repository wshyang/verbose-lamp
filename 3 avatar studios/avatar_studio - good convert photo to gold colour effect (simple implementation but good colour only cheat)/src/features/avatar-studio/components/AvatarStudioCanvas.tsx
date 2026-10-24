import { useEffect, useRef } from 'react';
import type { RgbaImage } from '../types';
import './AvatarStudioCanvas.css';

interface AvatarStudioCanvasProps {
  readonly image: RgbaImage | null;
  readonly label: string;
  readonly isShimmering: boolean;
}

/**
 * ADDENDUM-017 — the plate, drawn.
 *
 * A thin canvas and nothing else: the picture itself is computed by the engine, so
 * what is on screen is exactly what the PNG will hold.
 */
export function AvatarStudioCanvas({ image, label, isShimmering }: AvatarStudioCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || !image) return;
    canvas.width = image.width;
    canvas.height = image.height;
    const pixels = context.createImageData(image.width, image.height);
    pixels.data.set(image.data);
    context.putImageData(pixels, 0, 0);
  }, [image]);

  return (
    <div className="avatar-studio-frame relative aspect-square w-full overflow-hidden">
      {image ? (
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={label}
          className="absolute inset-0 h-full w-full object-contain"
          data-testid="avatar-studio__preview"
        />
      ) : (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center"
          data-testid="avatar-studio__placeholder"
        >
          <SparkleMark />
          <span className="font-deco text-[11px] tracking-[0.24em] uppercase text-[#d4af37]/70">
            No sitter yet
          </span>
          <span className="text-[10px] leading-relaxed tracking-[0.12em] text-[#d4af37]/45">
            Upload a photograph, or call for Wei_Ling.
          </span>
        </div>
      )}
      {isShimmering && image ? <span aria-hidden="true" className="avatar-studio-sheen" /> : null}
    </div>
  );
}

function SparkleMark() {
  return (
    <svg viewBox="0 0 40 40" className="h-9 w-9 text-[#d4af37]/60" aria-hidden="true">
      <path
        d="M20 2 L23.4 16.6 L38 20 L23.4 23.4 L20 38 L16.6 23.4 L2 20 L16.6 16.6 Z"
        fill="currentColor"
        opacity="0.55"
      />
    </svg>
  );
}
