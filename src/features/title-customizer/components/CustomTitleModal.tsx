import React from 'react';
import { X } from 'lucide-react';
import type { HeroTitleConfig } from '@/features/premiere/model/types';
import { CornerBrackets, Dialog, IconButton } from '@/shared/ui';
import { useTitleDraft } from '../hooks/useTitleDraft';
import { PresetBar } from './PresetBar';
import { TitleForm } from './TitleForm';

interface CustomTitleModalProps {
  open: boolean;
  config: HeroTitleConfig;
  onApply: (newConfig: HeroTitleConfig) => void;
  onClose: () => void;
}

export const CustomTitleModal: React.FC<CustomTitleModalProps> = ({ open, config, onApply, onClose }) => {
  const title = useTitleDraft({ open, config, onApply, onClose });

  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="title-customizer__title"
      className="relative w-full max-w-lg border border-[#d4af37]/50 bg-[#09070c]/95 p-6 shadow-[0_0_70px_rgba(212,175,55,0.2)] sm:p-7"
      backdropClassName="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
      testId="title-customizer__dialog"
    >
      <CornerBrackets sizeClass="w-4 h-4" />

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

      <PresetBar onSelect={title.applyPreset} />
      <TitleForm
        draft={title.draft}
        onText={title.setText}
        onPinstripe={title.setPinstripe}
        onReset={title.reset}
        onSubmit={title.submit}
      />
    </Dialog>
  );
};
