import React, { useEffect, useState } from 'react';
import { X, Wand2, RotateCcw } from 'lucide-react';
import { DEFAULT_HERO_TITLE } from '../data/gatsbyResearch';
import { HeroTitleConfig } from '../types/sequence';

interface CustomTitleModalProps {
  open: boolean;
  config: HeroTitleConfig;
  onApply: (newConfig: HeroTitleConfig) => void;
  onClose: () => void;
}

const FITZGERALD_PRESETS: Array<{ name: string; cfg: HeroTitleConfig }> = [
  {
    name: 'Original 2013 Film Lockup',
    cfg: { ...DEFAULT_HERO_TITLE },
  },
  {
    name: 'Trimalchio (Fitzgerald 1924 Draft)',
    cfg: {
      keystone: 'IN',
      preTitle: 'WEST EGG',
      mainTitle: 'TRIMALCHIO',
      subCredit: 'F. SCOTT FITZGERALD · WORKING MANUSCRIPT TITLE',
      pinstripeAlternation: true,
    },
  },
  {
    name: 'Gold-Hatted Gatsby',
    cfg: {
      keystone: 'THE',
      preTitle: 'GOLD-HATTED',
      mainTitle: 'GATSBY',
      subCredit: 'THOMAS PARKE D’INVILLIERS EPIGRAPH EDITION',
      pinstripeAlternation: true,
    },
  },
  {
    name: 'Roaring Twenties Gala',
    cfg: {
      keystone: 'THE',
      preTitle: 'ROARING',
      mainTitle: 'TWENTIES',
      subCredit: 'LONG ISLAND · NEW YORK · MCMXXII',
      pinstripeAlternation: true,
    },
  },
];

export const CustomTitleModal: React.FC<CustomTitleModalProps> = ({
  open,
  config,
  onApply,
  onClose,
}) => {
  const [draft, setDraft] = useState<HeroTitleConfig>(config);

  useEffect(() => {
    if (open) {
      setDraft({ ...config });
    }
  }, [open, config]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onApply({
      keystone: draft.keystone.trim().slice(0, 8) || 'THE',
      preTitle: draft.preTitle.trim().slice(0, 18),
      mainTitle: draft.mainTitle.trim().slice(0, 16) || 'GATSBY',
      subCredit: draft.subCredit.trim().slice(0, 46),
      pinstripeAlternation: draft.pinstripeAlternation,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-[#09070c]/95 border border-[#d4af37]/50 shadow-[0_0_70px_rgba(212,175,55,0.2)] p-6 sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="pointer-events-none absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-[#f8e29b]/70" />
        <span className="pointer-events-none absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-[#f8e29b]/70" />
        <span className="pointer-events-none absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-[#f8e29b]/70" />
        <span className="pointer-events-none absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-[#f8e29b]/70" />

        <div className="flex items-start justify-between border-b border-[#d4af37]/25 pb-4 mb-5">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-[#d4af37]">
              Procedural 3D WebGL Typography & Frame Builder
            </div>
            <h2 className="mt-1 text-lg sm:text-xl font-deco tracking-[0.14em] text-[#fff4d4]">
              INSCRIBE CUSTOM HERO TITLE
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#d4af37]/80 hover:text-[#fff4d4] border border-[#d4af37]/30 hover:border-[#f8e29b] transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Historical Presets */}
        <div className="mb-5">
          <div className="text-[10px] tracking-[0.22em] uppercase text-[#d4af37]/80 mb-2">
            Fitzgerald & Archival Presets
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FITZGERALD_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => setDraft({ ...preset.cfg })}
                className="px-2.5 py-1 text-[11px] border border-[#d4af37]/30 bg-[#120e18] hover:border-[#f8e29b] hover:text-[#fff6dc] text-[#e5d2ab] transition-colors cursor-pointer"
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] tracking-[0.22em] uppercase text-[#d4af37] mb-1">
                Upper Keystone
              </label>
              <input
                type="text"
                maxLength={8}
                value={draft.keystone}
                onChange={(e) => setDraft({ ...draft, keystone: e.target.value.toUpperCase() })}
                className="w-full bg-[#0e0b14] border border-[#d4af37]/35 px-3 py-2 text-xs tracking-[0.2em] text-[#fff4d4] focus:outline-none focus:border-[#f8e29b]"
                placeholder="THE"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] tracking-[0.22em] uppercase text-[#d4af37] mb-1">
                Upper Frieze Line
              </label>
              <input
                type="text"
                maxLength={18}
                value={draft.preTitle}
                onChange={(e) => setDraft({ ...draft, preTitle: e.target.value.toUpperCase() })}
                className="w-full bg-[#0e0b14] border border-[#d4af37]/35 px-3 py-2 text-xs tracking-[0.25em] text-[#fff4d4] focus:outline-none focus:border-[#f8e29b]"
                placeholder="GREAT"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] tracking-[0.22em] uppercase text-[#d4af37] mb-1">
              Monumental Center Title (Auto-Sizes Golden Frame)
            </label>
            <input
              type="text"
              maxLength={16}
              value={draft.mainTitle}
              onChange={(e) => setDraft({ ...draft, mainTitle: e.target.value.toUpperCase() })}
              className="w-full bg-[#0e0b14] border border-[#d4af37]/45 px-3.5 py-2.5 text-base font-deco tracking-[0.22em] text-[#fff6dc] focus:outline-none focus:border-[#f8e29b]"
              placeholder="GATSBY"
            />
          </div>

          <div>
            <label className="block text-[10px] tracking-[0.22em] uppercase text-[#d4af37] mb-1">
              Lower Pediment Credit
            </label>
            <input
              type="text"
              maxLength={46}
              value={draft.subCredit}
              onChange={(e) => setDraft({ ...draft, subCredit: e.target.value.toUpperCase() })}
              className="w-full bg-[#0e0b14] border border-[#d4af37]/35 px-3 py-2 text-xs tracking-[0.16em] text-[#fff4d4] focus:outline-none focus:border-[#f8e29b]"
              placeholder="FROM THE NOVEL BY F. SCOTT FITZGERALD"
            />
          </div>

          <label className="flex items-center gap-3 pt-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.pinstripeAlternation}
              onChange={(e) => setDraft({ ...draft, pinstripeAlternation: e.target.checked })}
              className="accent-[#d4af37] w-4 h-4"
            />
            <span className="text-xs text-[#e6d6b5]">
              Enable Like Minded Studio Alternating 4-Line Deco Pinstripe Glyphs
            </span>
          </label>

          <div className="flex items-center justify-between pt-4 border-t border-[#d4af37]/25">
            <button
              type="button"
              onClick={() => setDraft({ ...DEFAULT_HERO_TITLE })}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs tracking-[0.16em] uppercase text-[#d4af37] hover:text-[#fff4d4] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>

            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#b88924] via-[#f0cf7b] to-[#b88924] text-[#09070c] text-xs font-semibold tracking-[0.22em] uppercase hover:brightness-110 transition-all cursor-pointer shadow-[0_0_24px_rgba(248,226,155,0.35)]"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Render in WebGL</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
