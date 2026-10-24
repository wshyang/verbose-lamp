import React, { useEffect, useState } from 'react';
import { X, Wand2, RotateCcw } from 'lucide-react';
import { DEFAULT_HERO_TITLE } from '@/features/premiere/data/sequence';
import type { HeroTitleConfig } from '@/features/premiere/model/types';
import { Button, Dialog, IconButton } from '@/shared/ui';
import { HERO_TITLE_PRESETS } from '../data/titlePresets';
import { normalizeHeroTitle } from '../model/normalizeHeroTitle';

interface CustomTitleModalProps {
  open: boolean;
  config: HeroTitleConfig;
  onApply: (newConfig: HeroTitleConfig) => void;
  onClose: () => void;
}

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
    onApply(normalizeHeroTitle(draft));
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="title-customizer__title"
      className="relative w-full max-w-lg border border-[#d4af37]/50 bg-[#09070c]/95 p-6 shadow-[0_0_70px_rgba(212,175,55,0.2)] sm:p-7"
      backdropClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
      testId="title-customizer__dialog"
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
            <h2 id="title-customizer__title" className="mt-1 text-lg font-deco tracking-[0.14em] text-[#fff4d4] sm:text-xl">
              INSCRIBE CUSTOM HERO TITLE
            </h2>
          </div>
          <IconButton
            onClick={onClose}
            label="Close title customizer"
            icon={<X className="h-4 w-4" />}
            className="border-[#d4af37]/30 p-1.5 text-[#d4af37]/80 hover:border-[#f8e29b] hover:text-[#fff4d4]"
            data-testid="title-customizer__close"
          />
        </div>

        {/* Historical Presets */}
        <div className="mb-5">
          <div className="text-[10px] tracking-[0.22em] uppercase text-[#d4af37]/80 mb-2">
            Fitzgerald & Archival Presets
          </div>
          <div className="flex flex-wrap gap-1.5">
            {HERO_TITLE_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                onClick={() => setDraft({ ...preset.config })}
                size="small"
                className="border-[#d4af37]/30 bg-[#120e18] text-[#e5d2ab] hover:border-[#f8e29b] hover:text-[#fff6dc]"
                data-testid="title-customizer__preset"
              >
                {preset.name}
              </Button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="title-keystone" className="mb-1 block text-[10px] uppercase tracking-[0.22em] text-[#d4af37]">
                Upper Keystone
              </label>
              <input
                id="title-keystone"
                type="text"
                maxLength={8}
                value={draft.keystone}
                onChange={(e) => setDraft({ ...draft, keystone: e.target.value.toUpperCase() })}
                className="w-full bg-[#0e0b14] border border-[#d4af37]/35 px-3 py-2 text-xs tracking-[0.2em] text-[#fff4d4] focus:outline-none focus:border-[#f8e29b]"
                placeholder="THE"
                data-testid="title-customizer__keystone"
              />
            </div>
            <div className="col-span-2">
              <label htmlFor="title-pre-title" className="mb-1 block text-[10px] uppercase tracking-[0.22em] text-[#d4af37]">
                Upper Frieze Line
              </label>
              <input
                id="title-pre-title"
                type="text"
                maxLength={18}
                value={draft.preTitle}
                onChange={(e) => setDraft({ ...draft, preTitle: e.target.value.toUpperCase() })}
                className="w-full bg-[#0e0b14] border border-[#d4af37]/35 px-3 py-2 text-xs tracking-[0.25em] text-[#fff4d4] focus:outline-none focus:border-[#f8e29b]"
                placeholder="GREAT"
                data-testid="title-customizer__pre-title"
              />
            </div>
          </div>

          <div>
            <label htmlFor="title-main" className="mb-1 block text-[10px] uppercase tracking-[0.22em] text-[#d4af37]">
              Monumental Center Title (Auto-Sizes Golden Frame)
            </label>
            <input
              id="title-main"
              type="text"
              maxLength={16}
              value={draft.mainTitle}
              onChange={(e) => setDraft({ ...draft, mainTitle: e.target.value.toUpperCase() })}
              className="w-full bg-[#0e0b14] border border-[#d4af37]/45 px-3.5 py-2.5 text-base font-deco tracking-[0.22em] text-[#fff6dc] focus:outline-none focus:border-[#f8e29b]"
              placeholder="GATSBY"
              data-testid="title-customizer__main-title"
            />
          </div>

          <div>
            <label htmlFor="title-credit" className="mb-1 block text-[10px] uppercase tracking-[0.22em] text-[#d4af37]">
              Lower Pediment Credit
            </label>
            <input
              id="title-credit"
              type="text"
              maxLength={46}
              value={draft.subCredit}
              onChange={(e) => setDraft({ ...draft, subCredit: e.target.value.toUpperCase() })}
              className="w-full bg-[#0e0b14] border border-[#d4af37]/35 px-3 py-2 text-xs tracking-[0.16em] text-[#fff4d4] focus:outline-none focus:border-[#f8e29b]"
              placeholder="FROM THE NOVEL BY F. SCOTT FITZGERALD"
              data-testid="title-customizer__credit"
            />
          </div>

          <label className="flex items-center gap-3 pt-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.pinstripeAlternation}
              onChange={(e) => setDraft({ ...draft, pinstripeAlternation: e.target.checked })}
              className="accent-[#d4af37] w-4 h-4"
              data-testid="title-customizer__pinstripe"
            />
            <span className="text-xs text-[#e6d6b5]">
              Enable Like Minded Studio Alternating 4-Line Deco Pinstripe Glyphs
            </span>
          </label>

          <div className="flex items-center justify-between pt-4 border-t border-[#d4af37]/25">
            <Button
              type="button"
              onClick={() => setDraft({ ...DEFAULT_HERO_TITLE })}
              variant="quiet"
              size="compact"
              className="py-2 text-xs tracking-[0.16em]"
              data-testid="title-customizer__reset"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </Button>

            <Button
              type="submit"
              variant="accent"
              size="control"
              className="gap-2 px-5 font-semibold"
              data-testid="title-customizer__apply"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Render in WebGL</span>
            </Button>
          </div>
        </form>
    </Dialog>
  );
};
