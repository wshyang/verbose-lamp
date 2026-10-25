import type { DrawPhase } from '../hooks/useLuckyDraw';
import type { LuckyDrawEntry } from '../model/entries';

interface LuckyDrawResultProps {
  phase: DrawPhase;
  winner: LuckyDrawEntry | null;
  guestsInDrum: number;
}

/** The announced result line (aria-live), or the drum's status while it turns. */
export function LuckyDrawResult({ phase, winner, guestsInDrum }: LuckyDrawResultProps) {
  const status = phase === 'spinning' ? 'THE DRUM TURNS…' : `${guestsInDrum} GUESTS IN THE DRUM`;
  return (
    <div aria-live="polite" role="status" className="min-h-8 text-center" data-testid="lucky-draw__winner">
      {phase === 'landed' && winner ? (
        <p className="font-display text-lg tracking-[0.2em] text-[#f4dfa8]">
          {winner.name.toUpperCase()}
          {winner.subtitle ? <span className="ml-3 font-body text-sm text-[#b3925a]">{winner.subtitle}</span> : null}
        </p>
      ) : (
        <p className="font-body text-sm tracking-[0.25em] text-[#9a7c48]">{status}</p>
      )}
    </div>
  );
}
