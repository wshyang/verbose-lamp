import { DecoLatticeFrame, type DecoLatticeRequest } from '@/features/deco-lattice';
import { MarqueeBorder } from '@/features/spectacle';

interface TitleMedallionProps {
  lattice: Partial<DecoLatticeRequest>;
  hasMarquee: boolean;
  tagline: string;
}

/** The title plaque: lattice frame, optional marquee bulbs, title and tagline. */
export function TitleMedallion({ lattice, hasMarquee, tagline }: TitleMedallionProps) {
  return (
    <div className="relative w-[min(82vmin,640px)]">
      <DecoLatticeFrame request={{ mode: 'medallion', ...lattice }} className="aspect-square w-full">
        {hasMarquee && <MarqueeBorder mode="chase" bulbCount={64} />}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-[18%] text-center sm:gap-3">
          <p className="font-body text-[9px] tracking-[0.5em] text-[#b3925a] sm:text-[11px]">ONE NIGHT ONLY</p>
          <h1 className="gilded-title font-display text-4xl leading-[1.08] text-[#f2d38a] sm:text-5xl md:text-6xl">
            THE<br />GREAT<br />GATSBY
          </h1>
          <div className="flex w-full items-center gap-2" aria-hidden="true">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#c9a44e]" />
            <span className="h-1.5 w-1.5 rotate-45 bg-[#e9c877]" />
            <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#c9a44e]" />
          </div>
          <p className="font-body text-xs tracking-[0.45em] text-[#e9c877] sm:text-base">DINNER &amp; DANCE</p>
          <p className="min-h-4 font-body text-[8px] tracking-[0.28em] text-[#9a7c48] sm:text-[10px]" data-testid="event-night__tagline">
            {tagline}
          </p>
        </div>
      </DecoLatticeFrame>
    </div>
  );
}
