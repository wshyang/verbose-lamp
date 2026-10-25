import React from 'react';
import { Sparkles, X } from 'lucide-react';
import { IconButton } from '@/shared/ui';

/** The four corner brackets that frame the dossier. */
const CornerBrackets: React.FC = () => (
  <>
{/* Art Deco Corner Brackets */}
<span className="pointer-events-none absolute top-2 left-2 w-5 h-5 border-t-2 border-l-2 border-[#f8e29b]/70" />
<span className="pointer-events-none absolute top-2 right-2 w-5 h-5 border-t-2 border-r-2 border-[#f8e29b]/70" />
<span className="pointer-events-none absolute bottom-2 left-2 w-5 h-5 border-b-2 border-l-2 border-[#f8e29b]/70" />
<span className="pointer-events-none absolute bottom-2 right-2 w-5 h-5 border-b-2 border-r-2 border-[#f8e29b]/70" />
  </>
);

/** Title bar: the dossier eyebrow, the decorative title, and the close control. */
export const DossierHeader: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <>
    <CornerBrackets />

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
  </>
);
