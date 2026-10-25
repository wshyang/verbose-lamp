import React from 'react';
import { RotateCcw, Wand2 } from 'lucide-react';
import { Button } from '@/shared/ui';

/** Commit or discard the draft. Submit is the only path that applies the title. */
export const ModalFooter: React.FC<{ onReset: () => void }> = ({ onReset }) => (
  <div className="flex items-center justify-between pt-4 border-t border-[#d4af37]/25">
    <Button
      type="button"
      onClick={onReset}
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
);
