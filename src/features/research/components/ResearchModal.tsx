import React from 'react';
import { X, Sparkles } from 'lucide-react';
import { GATSBY_RESEARCH_SECTIONS } from '../data/researchSections';
import { CornerBrackets, Dialog, IconButton } from '@/shared/ui';
import { ResearchFigures } from './ResearchFigures';
import { ResearchSectionCard } from './ResearchSectionCard';

interface ResearchModalProps {
  open: boolean;
  onClose: () => void;
}

function DossierHeader({ onClose }: Pick<ResearchModalProps, 'onClose'>) {
  return (
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
  );
}

export const ResearchModal: React.FC<ResearchModalProps> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="research-dialog__title"
      className="relative flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden border border-[#d4af37]/45 bg-[#09070c]/95 shadow-[0_0_80px_rgba(212,175,55,0.18)]"
      backdropClassName="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md sm:p-6"
      testId="research-dialog__backdrop"
    >
      <CornerBrackets sizeClass="w-5 h-5" />
      <DossierHeader onClose={onClose} />
      <div className="overflow-y-auto deco-scroll px-6 sm:px-8 py-6 space-y-7">
        <ResearchFigures />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {GATSBY_RESEARCH_SECTIONS.map((section) => (
            <ResearchSectionCard key={section.id} section={section} />
          ))}
        </div>
      </div>
    </Dialog>
  );
};
