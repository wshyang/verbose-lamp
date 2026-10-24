import { useCallback, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/shared/ui';
import { GildedPortraitModal } from './GildedPortraitModal';

interface GildedPortraitLauncherProps {
  readonly className?: string;
}

/** Self-contained entry point. Hosts can opt in without importing modal state. */
export function GildedPortraitLauncher({ className }: GildedPortraitLauncherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <>
      <Button
        type="button"
        onClick={() => setIsOpen(true)}
        className={className}
        title="Create a face-aware gold avatar"
        aria-label="Open Gold Avatar Studio"
        aria-haspopup="dialog"
        data-testid="gilded-portrait__launch"
      >
        <Sparkles className="h-3.5 w-3.5 text-[#f8e29b]" aria-hidden="true" />
        <span>Avatar Studio</span>
      </Button>
      <GildedPortraitModal open={isOpen} onClose={close} />
    </>
  );
}