import { Dices, RotateCcw } from 'lucide-react';
import type { useLuckyDraw } from '../hooks/useLuckyDraw';

type LuckyDraw = ReturnType<typeof useLuckyDraw>;

const COUNT_OPTIONS = [2, 30, 300] as const;
const MIN_POOL_TO_SPIN = 2;
const MIN_POOL_TO_REDRAW = 3;

const GHOST_BUTTON =
  'border border-[#8a6a2f]/60 text-[#d8b878] transition hover:bg-[#8a6a2f]/20 disabled:opacity-40 ' +
  'focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#f2d38a]';

/** Guest count, spin, redraw and reset. Pure presentation over the draw state. */
export function LuckyDrawControls({ draw }: { draw: LuckyDraw }) {
  const isSpinning = draw.phase === 'spinning';
  return (
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
        disabled={isSpinning || draw.pool.length < MIN_POOL_TO_SPIN}
        data-testid="lucky-draw__spin"
        className="flex items-center gap-2 border border-[#d9b264] bg-gradient-to-b from-[#a87c33] to-[#6e4d1c] px-6 py-2 text-sm font-semibold tracking-[0.2em] text-[#fff3d0] shadow-[0_0_18px_rgba(217,178,100,0.35)] transition hover:brightness-115 disabled:opacity-40"
      >
        <Dices size={16} aria-hidden /> SPIN
      </button>
      <button
        type="button"
        onClick={draw.redraw}
        disabled={draw.phase !== 'landed' || draw.pool.length < MIN_POOL_TO_REDRAW}
        data-testid="lucky-draw__redraw"
        className={`px-4 py-2 text-xs tracking-widest ${GHOST_BUTTON}`}
      >
        REDRAW ({draw.drawnCount})
      </button>
      <button
        type="button"
        onClick={draw.reset}
        data-testid="lucky-draw__reset"
        className={`flex items-center gap-1.5 px-4 py-2 text-xs tracking-widest ${GHOST_BUTTON}`}
      >
        <RotateCcw size={13} aria-hidden /> RESET
      </button>
    </div>
  );
}
