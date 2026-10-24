import React, { useCallback, useState } from 'react';
import { QrCode } from 'lucide-react';
import { Button } from '@/shared/ui';
import { QrGeneratorModal } from './QrGeneratorModal';

interface QrGeneratorLauncherProps {
  className?: string;
}

/**
 * Self-contained entry point: a header button plus the modal it opens. Owning the
 * open state here keeps the host component's wiring to a single element.
 */
export const QrGeneratorLauncher: React.FC<QrGeneratorLauncherProps> = ({ className }) => {
  const [isOpen, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
        title="Engrave a scannable Golden QR plaque"
        aria-haspopup="dialog"
        data-testid="qr-generator__launch"
      >
        <QrCode className="w-3.5 h-3.5 text-[#f8e29b]" />
        <span className="hidden sm:inline">Golden QR</span>
        <span className="sm:hidden">QR</span>
      </Button>
      <QrGeneratorModal open={isOpen} onClose={close} />
    </>
  );
};
