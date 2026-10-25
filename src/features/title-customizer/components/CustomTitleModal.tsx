import React from 'react';
import type { HeroTitleConfig } from '@/features/premiere/model/types';
import { Dialog } from '@/shared/ui';
import { useTitleDraft } from '../hooks/useTitleDraft';
import { normalizeHeroTitle } from '../model/normalizeHeroTitle';
import { ModalHeader } from './dialog/ModalHeader';
import { PresetRow } from './dialog/PresetRow';
import { TitleForm } from './dialog/TitleForm';

interface CustomTitleModalProps {
  open: boolean;
  config: HeroTitleConfig;
  onApply: (newConfig: HeroTitleConfig) => void;
  onClose: () => void;
}

/**
 * The title customizer dialog: a working copy of the lockup, committed only when
 * "Render in WebGL" is pressed (ADDENDUM-036). `useTitleDraft` owns the draft and
 * the per-field rules; the three children below own their own markup.
 */
export const CustomTitleModal: React.FC<CustomTitleModalProps> = ({ open, config, onApply, onClose }) => {
  const { draft, setText, setPinstripe, applyPreset, reset } = useTitleDraft(open, config);

  if (!open) return null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
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
      <ModalHeader onClose={onClose} />
      <PresetRow onPick={applyPreset} />
      <TitleForm
        draft={draft}
        onText={setText}
        onPinstripe={setPinstripe}
        onReset={reset}
        onSubmit={handleSubmit}
      />
    </Dialog>
  );
};
