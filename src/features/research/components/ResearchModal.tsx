import React from 'react';
import { X, Sparkles } from 'lucide-react';
import { GATSBY_RESEARCH_SECTIONS } from '../data/researchSections';
import { Dialog, IconButton } from '@/shared/ui';

interface ResearchModalProps {
  open: boolean;
  onClose: () => void;
}

export const ResearchModal: React.FC<ResearchModalProps> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="research-dialog__title"
      className="relative flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden border border-[#d4af37]/45 bg-[#09070c]/95 shadow-[0_0_80px_rgba(212,175,55,0.18)]"
      backdropClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md sm:p-6"
      testId="research-dialog__backdrop"
    >
        {/* Art Deco Corner Brackets */}
        <span className="pointer-events-none absolute top-2 left-2 w-5 h-5 border-t-2 border-l-2 border-[#f8e29b]/70" />
        <span className="pointer-events-none absolute top-2 right-2 w-5 h-5 border-t-2 border-r-2 border-[#f8e29b]/70" />
        <span className="pointer-events-none absolute bottom-2 left-2 w-5 h-5 border-b-2 border-l-2 border-[#f8e29b]/70" />
        <span className="pointer-events-none absolute bottom-2 right-2 w-5 h-5 border-b-2 border-r-2 border-[#f8e29b]/70" />

        {/* Header */}
        <div className="flex items-start justify-between px-6 sm:px-8 pt-6 pb-4 border-b border-[#d4af37]/25">
          <div>
            <div className="flex items-center gap-2 text-[11px] tracking-[0.32em] uppercase text-[#d4af37]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Motion & Typography Research Dossier</span>
            </div>
            <h2 id="research-dialog__title" className="mt-1.5 text-xl font-deco tracking-[0.14em] text-[#fff4d4] sm:text-2xl">
              ANATOMY OF THE GREAT GATSBY (2013) TITLES
            </h2>
          </div>
          <IconButton
            onClick={onClose}
            label="Close research dossier"
            icon={<X className="h-4 w-4" />}
            className="h-9 w-9 border-[#d4af37]/30 p-2 text-[#d4af37]/80 hover:border-[#f8e29b] hover:text-[#fff4d4]"
            data-testid="research-dialog__close"
          />
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto deco-scroll px-6 sm:px-8 py-6 space-y-7">
          {/* Architectural Visual Breakdown Diagrams */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Diagram 1: Alternating Solid + 4-Line Deco Pinstripe */}
            <div className="border border-[#d4af37]/30 bg-[#0d0a12] p-4 flex flex-col justify-between">
              <div className="text-[10px] tracking-[0.26em] uppercase text-[#d4af37] mb-2">
                Fig. I · Deco Pinstripe System
              </div>
              <svg viewBox="0 0 220 90" className="w-full h-20 my-1">
                {/* 4-line inline G */}
                <g fill="none" stroke="#f8e29b" strokeLinecap="butt">
                  <path d="M55 24 A22 22 0 1 0 55 66 L55 48 L36 48" strokeWidth="13" opacity="0.18" />
                  <path d="M55 24 A22 22 0 1 0 55 66 L55 48 L36 48" strokeWidth="11" />
                  <path d="M55 24 A22 22 0 1 0 55 66 L55 48 L36 48" stroke="#0d0a12" strokeWidth="7.8" />
                  <path d="M55 24 A22 22 0 1 0 55 66 L55 48 L36 48" stroke="#f8e29b" strokeWidth="4.6" />
                  <path d="M55 24 A22 22 0 1 0 55 66 L55 48 L36 48" stroke="#0d0a12" strokeWidth="1.6" />
                </g>
                {/* Solid Chiseled A */}
                <g fill="none" stroke="#e9eef7" strokeWidth="11" strokeLinejoin="miter">
                  <path d="M84 70 L104 18 L124 70" />
                  <path d="M90 54 L118 54" strokeWidth="8" />
                </g>
                {/* 4-line inline T */}
                <g fill="none" strokeLinecap="butt">
                  <path d="M144 20 L190 20 M167 20 L167 70" stroke="#f8e29b" strokeWidth="11" />
                  <path d="M144 20 L190 20 M167 20 L167 70" stroke="#0d0a12" strokeWidth="7.8" />
                  <path d="M144 20 L190 20 M167 20 L167 70" stroke="#f8e29b" strokeWidth="4.6" />
                  <path d="M144 20 L190 20 M167 20 L167 70" stroke="#0d0a12" strokeWidth="1.6" />
                </g>
              </svg>
              <p className="text-xs font-editorial text-[#e6d6b5]/80 leading-relaxed">
                Like Minded Studio paired 4-stripe concentric inline glyphs with solid chiseled platinum glyphs on alternating letters.
              </p>
            </div>

            {/* Diagram 2: 6-Facet Chamfered Gold Rail */}
            <div className="border border-[#d4af37]/30 bg-[#0d0a12] p-4 flex flex-col justify-between">
              <div className="text-[10px] tracking-[0.26em] uppercase text-[#d4af37] mb-2">
                Fig. II · 3D Bevelled Gold Rail
              </div>
              <svg viewBox="0 0 220 90" className="w-full h-20 my-1">
                <polygon
                  points="36,68 58,34 162,34 184,68"
                  fill="rgba(212,175,55,0.18)"
                  stroke="#f8e29b"
                  strokeWidth="1.8"
                />
                <line x1="78" y1="34" x2="78" y2="68" stroke="#d4af37" strokeDasharray="3 3" />
                <line x1="142" y1="34" x2="142" y2="68" stroke="#d4af37" strokeDasharray="3 3" />
                {/* Specular rays */}
                <line x1="46" y1="48" x2="26" y2="22" stroke="#fff6dc" strokeWidth="1.4" />
                <line x1="110" y1="34" x2="110" y2="12" stroke="#fff6dc" strokeWidth="1.4" />
                <line x1="174" y1="48" x2="194" y2="22" stroke="#fff6dc" strokeWidth="1.4" />
                <text x="110" y="83" textAnchor="middle" fill="#d4af37" fontSize="9" letterSpacing="2">
                  45° CHAMFERED PRISM
                </text>
              </svg>
              <p className="text-xs font-editorial text-[#e6d6b5]/80 leading-relaxed">
                Deva & Method Studios modeled every golden frame line as a 3D chamfered rail so raking spotlights glint off angled facets.
              </p>
            </div>

            {/* Diagram 3: Stereoscopic Z-Corridor */}
            <div className="border border-[#d4af37]/30 bg-[#0d0a12] p-4 flex flex-col justify-between">
              <div className="text-[10px] tracking-[0.26em] uppercase text-[#d4af37] mb-2">
                Fig. III · Z-Axis Portal Sweep
              </div>
              <svg viewBox="0 0 220 90" className="w-full h-20 my-1">
                <rect x="28" y="14" width="164" height="62" fill="none" stroke="#f8e29b" strokeWidth="1.6" />
                <rect x="54" y="24" width="112" height="42" fill="none" stroke="#d4af37" strokeWidth="1.2" opacity="0.75" />
                <rect x="78" y="33" width="64" height="24" fill="none" stroke="#d4af37" strokeWidth="1" opacity="0.5" />
                <circle cx="110" cy="45" r="3.5" fill="#14f582" />
                <path d="M16 45 L42 45 M204 45 L178 45" stroke="#fff4d4" strokeWidth="1.4" />
              </svg>
              <p className="text-xs font-editorial text-[#e6d6b5]/80 leading-relaxed">
                Built natively for 3D cinema: multi-plane golden frames draw outward, hold during push-in, then part open as the lens flies through.
              </p>
            </div>
          </div>

          {/* Detailed Research Sections */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {GATSBY_RESEARCH_SECTIONS.map((sec) => (
              <div
                key={sec.id}
                className="border border-[#d4af37]/25 bg-[#0c0910]/90 p-5 space-y-3"
              >
                <div className="flex items-baseline justify-between gap-2 border-b border-[#d4af37]/20 pb-2">
                  <span className="text-xs font-deco tracking-[0.28em] text-[#f8e29b]">
                    SECTION {sec.numeral}
                  </span>
                  <span className="text-[10px] tracking-[0.16em] uppercase text-[#d4af37]/75 text-right">
                    {sec.subtitle}
                  </span>
                </div>
                <h3 className="text-base font-deco tracking-[0.1em] text-[#fff4d4]">
                  {sec.title}
                </h3>
                <p className="text-[11px] uppercase tracking-[0.14em] text-[#d4af37]/90">
                  {sec.credits}
                </p>
                <p className="text-sm font-editorial text-[#eadbc0]/90 leading-relaxed">
                  {sec.summary}
                </p>
                <ul className="space-y-1.5 pt-1">
                  {sec.bulletPoints.map((pt, i) => (
                    <li
                      key={i}
                      className="text-xs font-editorial text-[#d9c7a3]/85 flex items-start gap-2 leading-relaxed"
                    >
                      <span className="mt-1.5 w-1.5 h-1.5 rotate-45 bg-[#d4af37] shrink-0" />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
    </Dialog>
  );
};
