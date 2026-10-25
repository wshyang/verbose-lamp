import React from 'react';
import { X } from 'lucide-react';
import { IconButton } from '@/shared/ui';

/** The four engraved corner marks that frame the dialog. */
const CornerMarks: React.FC = () => (
  <>
    <span className="pointer-events-none absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-[#f8e29b]/70" />
    <span className="pointer-events-none absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-[#f8e29b]/70" />
    <span className="pointer-events-none absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-[#f8e29b]/70" />
    <span className="pointer-events-none absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-[#f8e29b]/70" />
  </>
);

/** Dialog chrome: corner marks, the eyebrow and title, and the close control. */
export const ModalHeader: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <>
    <CornerMarks />

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
  </>
);
