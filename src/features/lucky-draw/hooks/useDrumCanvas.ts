import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import { useReducedMotion } from '@/shared/hooks/useReducedMotion';
import type { LuckyDrawEntry } from '../model/entries';
import { drawDrum } from '../render/drumRenderer';

export const DRUM_WIDTH = 640;
export const DRUM_HEIGHT = 400;

const MAX_DPR = 2;
const BOB_PERIOD_MS = 6000;
const YAW_PERIOD_MS = 9000;
const BOB_PX = 6;
const YAW_DEG = 0.6;
const PLACEHOLDER_ENTRIES: readonly LuckyDrawEntry[] = [
  { id: 'a', name: '—' },
  { id: 'b', name: '—' },
];

interface DrumFeed {
  pool: readonly LuckyDrawEntry[];
  isLanded: boolean;
  positionRef: MutableRefObject<number>;
  speedRef: MutableRefObject<number>;
}

function applySway(ref: RefObject<HTMLDivElement | null>, now: number): void {
  if (!ref.current) return;
  const bob = Math.sin((now / BOB_PERIOD_MS) * Math.PI * 2) * BOB_PX;
  const yaw = Math.sin((now / YAW_PERIOD_MS) * Math.PI * 2) * YAW_DEG;
  ref.current.style.transform = `translateY(${bob}px) rotate(${yaw}deg)`;
}

/**
 * Runs the drum render loop and the gentle suspended-frame sway. The loop
 * reads the latest feed through a ref so React renders never restart it.
 */
export function useDrumCanvas(feed: DrumFeed) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const swayRef = useRef<HTMLDivElement | null>(null);
  const feedRef = useRef(feed);
  feedRef.current = feed;
  const isReducedMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    canvas.width = DRUM_WIDTH * dpr;
    canvas.height = DRUM_HEIGHT * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let raf = 0;
    const loop = (now: number) => {
      const current = feedRef.current;
      drawDrum(
        ctx,
        {
          position: current.positionRef.current,
          entries: current.pool.length >= 2 ? current.pool : PLACEHOLDER_ENTRIES,
          speed: current.speedRef.current,
          landedPlateGlow: current.isLanded,
        },
        { w: DRUM_WIDTH, h: DRUM_HEIGHT },
      );
      if (!isReducedMotion) applySway(swayRef, now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isReducedMotion]);

  return { canvasRef, swayRef };
}
