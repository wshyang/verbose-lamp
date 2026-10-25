import { useEffect, useRef } from 'react';
import { Dices, RotateCcw, X } from 'lucide-react';
import { DecoLatticeFrame } from '@/features/deco-lattice';
import { useReducedMotion } from '@/shared/hooks/useReducedMotion';
import { useLuckyDraw } from '../hooks/useLuckyDraw';
import type { LuckyDrawEntry } from '../model/entries';
import { drawDrum } from '../render/drumRenderer';

interface LuckyDrawStageProps {
  onClose: () => void;
  onLanded: (winner: LuckyDrawEntry) => void;
}

const COUNT_OPTIONS = [2, 30, 300] as const;

/** Renders the suspended frame + drum; all decisions live in the hook. */
export function LuckyDrawStage({ onClose, onLanded }: LuckyDrawStageProps) {
  const draw = useLuckyDraw({ onLanded });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bobRef = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const stateRef = useRef(draw);
  stateRef.current = draw;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = 640 * dpr;
    canvas.height = 400 * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let raf = 0;
    const loop = (now: number) => {
      const s = stateRef.current;
      drawDrum(ctx, {
        position: s.positionRef.current,
        entries: s.pool.length >= 2 ? s.pool : [{ id: 'a', name: '—' }, { id: 'b', name: '—' }],
        speed: s.speedRef.current,
        landedPlateGlow: s.phase === 'landed',
      }, 640, 400);
      if (bobRef.current && !reduced) {
        const bob = Math.sin((now / 6000) * Math.PI * 2) * 6;
        const yaw = Math.sin((now / 9000) * Math.PI * 2) * 0.6;
        bobRef.current.style.transform = `translateY(${bob}px) rotate(${yaw}deg)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  return (
    <div className="fixed inset-0 z-[35] flex items-center justify-center bg-black/70 backdrop-blur-[2px]" data-testid="lucky-draw__stage">
      <div ref={bobRef} className="flex w-[min(94vw,720px)] flex-col items-center gap-4">
        <div className="flex w-full items-center justify-between px-2">
          <h2 className="font-display text-xl tracking-[0.3em] text-[#e9c877] sm:text-2xl">THE LUCKY DRAW</h2>
          <button
            type="button"
            onClick={onClose}
            data-testid="lucky-draw__close"
            className="flex items-center gap-1.5 border border-[#8a6a2f]/60 px-3 py-1.5 text-xs tracking-widest text-[#d8b878] transition hover:bg-[#8a6a2f]/20"
          >
            <X size={14} aria-hidden /> CLOSE
          </button>
        </div>
        <DecoLatticeFrame
          request={{ mode: 'frame', hw: 1.6, hh: 1, level: 3, seed: 1925 }}
          className="aspect-[1.6] w-full"
        >
          <canvas ref={canvasRef} className="absolute inset-[9%] h-[82%] w-[82%]" style={{ width: '82%', height: '82%' }} />
        </DecoLatticeFrame>
        <div aria-live="polite" role="status" className="min-h-8 text-center" data-testid="lucky-draw__winner">
          {draw.phase === 'landed' && draw.winner ? (
            <p className="font-display text-lg tracking-[0.2em] text-[#f4dfa8]">
              {draw.winner.name.toUpperCase()}
              {draw.winner.subtitle ? <span className="ml-3 font-body text-sm text-[#b3925a]">{draw.winner.subtitle}</span> : null}
            </p>
          ) : (
            <p className="font-body text-sm tracking-[0.25em] text-[#9a7c48]">
              {draw.phase === 'spinning' ? 'THE DRUM TURNS…' : `${draw.pool.length} GUESTS IN THE DRUM`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <label className="flex items-center gap-2 text-xs tracking-widest text-[#b3925a]">
            GUESTS
            <select
              value={draw.guestCount}
              onChange={(e) => draw.setGuestCount(Number(e.target.value))}
              data-testid="lucky-draw__entries"
              className="border border-[#8a6a2f]/60 bg-[#171006] px-2 py-1.5 text-[#e9c877] outline-none"
            >
              {COUNT_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={draw.spin}
            disabled={draw.phase === 'spinning' || draw.pool.length < 2}
            data-testid="lucky-draw__spin"
            className="flex items-center gap-2 border border-[#d9b264] bg-gradient-to-b from-[#a87c33] to-[#6e4d1c] px-6 py-2 text-sm font-semibold tracking-[0.2em] text-[#fff3d0] shadow-[0_0_18px_rgba(217,178,100,0.35)] transition hover:brightness-115 disabled:opacity-40"
          >
            <Dices size={16} aria-hidden /> SPIN
          </button>
          <button
            type="button"
            onClick={draw.redraw}
            disabled={draw.phase !== 'landed' || draw.pool.length < 3}
            data-testid="lucky-draw__redraw"
            className="border border-[#8a6a2f]/60 px-4 py-2 text-xs tracking-widest text-[#d8b878] transition hover:bg-[#8a6a2f]/20 disabled:opacity-40"
          >
            REDRAW ({draw.drawnCount})
          </button>
          <button
            type="button"
            onClick={draw.reset}
            data-testid="lucky-draw__reset"
            className="flex items-center gap-1.5 border border-[#8a6a2f]/60 px-4 py-2 text-xs tracking-widest text-[#d8b878] transition hover:bg-[#8a6a2f]/20"
          >
            <RotateCcw size={13} aria-hidden /> RESET
          </button>
        </div>
      </div>
    </div>
  );
}