import React, { useCallback, useState } from 'react';
import { QrCode } from 'lucide-react';
import { QrGeneratorModal } from './QrGeneratorModal';

interface QrGeneratorLauncherProps {
  className?: string;
}

const DEFAULT_CLASS =
  'inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] tracking-[0.18em] uppercase bg-[#0a080f]/80 hover:bg-[#191322] border border-[#d4af37]/40 hover:border-[#f8e29b] text-[#f5e7c6] transition-all cursor-pointer backdrop-blur-sm';

/**
 * Self-contained entry point: a header button plus the modal it opens. Owning the
 * open state here keeps the host component's wiring to a single element.
 */
export const QrGeneratorLauncher: React.FC<QrGeneratorLauncherProps> = ({ className }) => {
  const [isOpen, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? DEFAULT_CLASS}
        title="Engrave a scannable Golden QR plaque"
        data-testid="qr-generator__launch"
      >
        <QrCode className="w-3.5 h-3.5 text-[#f8e29b]" />
        <span className="hidden sm:inline">Golden QR</span>
        <span className="sm:hidden">QR</span>
      </button>
      <QrGeneratorModal open={isOpen} onClose={close} />
    </>
  );
};
