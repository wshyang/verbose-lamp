import type { ReactNode } from 'react';

interface FigureCardProps {
  caption: string;
  note: string;
  children: ReactNode;
}

/** One figure of the dossier: a caption, a 220x90 drawing, and a line of explanation. */
export function FigureCard({ caption, note, children }: FigureCardProps) {
  return (
    <div className="border border-[#d4af37]/30 bg-[#0d0a12] p-4 flex flex-col justify-between">
      <div className="text-[10px] tracking-[0.26em] uppercase text-[#d4af37] mb-2">{caption}</div>
      <svg viewBox="0 0 220 90" className="w-full h-20 my-1">
        {children}
      </svg>
      <p className="text-xs font-editorial text-[#e6d6b5]/80 leading-relaxed">{note}</p>
    </div>
  );
}
