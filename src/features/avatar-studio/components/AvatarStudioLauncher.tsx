import { useCallback, useState } from 'react';
import { UserRound } from 'lucide-react';
import { Button } from '@/shared/ui';
import { AvatarStudioModal } from './AvatarStudioModal';

interface AvatarStudioLauncherProps {
  readonly className?: string;
}

/** Self-contained entry point: a header button plus the studio it opens (pattern from the QR launcher). */
export function AvatarStudioLauncher({ className }: AvatarStudioLauncherProps) {
  const [isOpen, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
        title="Set your portrait in gold and enamel"
        aria-haspopup="dialog"
        data-testid="avatar-studio__launch"
      >
        <UserRound className="w-3.5 h-3.5 text-[#f8e29b]" />
        <span className="hidden sm:inline">Avatar Studio</span>
        <span className="sm:hidden">Avatar</span>
      </Button>
      <AvatarStudioModal open={isOpen} onClose={close} />
    </>
  );
}
