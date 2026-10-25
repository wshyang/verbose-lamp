import React from 'react';
import { Dialog } from '@/shared/ui';
import { DossierBody } from './dossier/DossierBody';
import { DossierHeader } from './dossier/DossierHeader';

interface ResearchModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The research dossier dialog (ADDENDUM-036): the chrome, and one scroll pane
 * whose content is a data table plus three hand-drawn plates.
 */
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
      <DossierHeader onClose={onClose} />
      <DossierBody />
    </Dialog>
  );
};
