import React from 'react';

interface FigureCardProps {
  caption: string;
  body: string;
  children: React.ReactNode;
}

/** One engraved plate: a caption, the drawing, and the note beneath it. */
export const FigureCard: React.FC<FigureCardProps> = ({ caption, body, children }) => (
  <div className="border border-[#d4af37]/30 bg-[#0d0a12] p-4 flex flex-col justify-between">
    <div className="text-[10px] tracking-[0.26em] uppercase text-[#d4af37] mb-2">{caption}</div>
    {children}
    <p className="text-xs font-editorial text-[#e6d6b5]/80 leading-relaxed">{body}</p>
  </div>
);
