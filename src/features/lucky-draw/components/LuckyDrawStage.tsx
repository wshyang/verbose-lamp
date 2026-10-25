import { X } from 'lucide-react';
import { DecoLatticeFrame } from '@/features/deco-lattice';
import { Dialog } from '@/shared/ui';
import { useDrumCanvas } from '../hooks/useDrumCanvas';
import { useLuckyDraw } from '../hooks/useLuckyDraw';
import type { LuckyDrawEntry } from '../model/entries';
import { LuckyDrawControls } from './LuckyDrawControls';
import { LuckyDrawResult } from './LuckyDrawResult';

interface LuckyDrawStageProps {
  onClose: () => void;
  onLanded: (winner: LuckyDrawEntry) => void;
}

const FRAME_REQUEST = { mode: 'frame', hw: 1.6, hh: 1, level: 3, seed: 1925 } as const;
// Below the spectacle canvases (z 40/41) so confetti and the name reveal show on top.
const BACKDROP_CLASS =
  'fixed inset-0 z-[35] flex items-center justify-center bg-black/70 backdrop-blur-[2px]';

/** Renders the suspended frame + drum inside a dialog; decisions live in hooks. */
export function LuckyDrawStage({ onClose, onLanded }: LuckyDrawStageProps) {
  const draw = useLuckyDraw({ onLanded });
  const { canvasRef, swayRef } = useDrumCanvas({
    pool: draw.pool,
    isLanded: draw.phase === 'landed',
    positionRef: draw.positionRef,
    speedRef: draw.speedRef,
  });

  return (
    <Dialog
      open
      onClose={onClose}
      labelledBy="lucky-draw__title"
      backdropClassName={BACKDROP_CLASS}
      closeOnBackdrop={false}
      testId="lucky-draw__stage"
      className="outline-none"
    >
      <div ref={swayRef} className="flex w-[min(94vw,720px)] flex-col items-center gap-4">
        <div className="flex w-full items-center justify-between px-2">
          <h2 id="lucky-draw__title" className="font-display text-xl tracking-[0.3em] text-[#e9c877] sm:text-2xl">
            THE LUCKY DRAW
          </h2>
          <button
            type="button"
            onClick={onClose}
            data-testid="lucky-draw__close"
            className="flex items-center gap-1.5 border border-[#8a6a2f]/60 px-3 py-1.5 text-xs tracking-widest text-[#d8b878] transition hover:bg-[#8a6a2f]/20"
          >
            <X size={14} aria-hidden /> CLOSE
          </button>
        </div>
        <DecoLatticeFrame request={FRAME_REQUEST} className="aspect-[1.6] w-full">
          <canvas ref={canvasRef} className="absolute inset-[9%] h-[82%] w-[82%]" style={{ width: '82%', height: '82%' }} />
        </DecoLatticeFrame>
        <LuckyDrawResult phase={draw.phase} winner={draw.winner} guestsInDrum={draw.pool.length} />
        <LuckyDrawControls draw={draw} />
      </div>
    </Dialog>
  );
}
