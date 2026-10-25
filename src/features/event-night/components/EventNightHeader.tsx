import type { ReactNode } from 'react';
import { ArrowLeft, Dices } from 'lucide-react';

interface EventNightHeaderProps {
  onExit: () => void;
  onOpenDraw: () => void;
  /** The spectacle launcher, supplied by the screen so the header stays presentational. */
  launcher: ReactNode;
}

const GOLD_BUTTON =
  'flex items-center gap-2 border border-[#8a6a2f]/60 px-3 py-1.5 text-[11px] tracking-[0.2em] text-[#d8b878] transition ' +
  'hover:border-[#d9b264] hover:bg-[#8a6a2f]/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f2d38a]';

/** Brand block on the left; back to the premiere, lucky draw and spectacle on the right. */
export function EventNightHeader({ onExit, onOpenDraw, launcher }: EventNightHeaderProps) {
  return (
    <header className="relative z-30 flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 rotate-45 items-center justify-center border border-[#c9a44e]/70 bg-[#171006]">
          <span className="-rotate-45 font-display text-[11px] text-[#f2d38a]">GG</span>
        </span>
        <div className="leading-tight">
          <p className="font-body text-[11px] tracking-[0.3em] text-[#e9c877]">WEST EGG GRAND BALLROOM</p>
          <p className="font-body text-[9px] tracking-[0.3em] text-[#9a7c48]">SATURDAY · OCTOBER 24 · 2026</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onExit} data-testid="event-night__back" className={GOLD_BUTTON}>
          <ArrowLeft size={13} aria-hidden /> PREMIERE
        </button>
        <button type="button" onClick={onOpenDraw} data-testid="event-night__open-draw" className={GOLD_BUTTON}>
          <Dices size={13} aria-hidden /> LUCKY DRAW
        </button>
        {launcher}
      </div>
    </header>
  );
}
