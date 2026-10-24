import { useCallback, useState, type ReactNode } from 'react';
import { Crown, UserRound } from 'lucide-react';
import { Button } from '@/shared/ui';
import { WEI_LING_AVATAR } from '../data/weiLing';
import type { AvatarStudioOptions } from '../hooks/useAvatarStudio';
import { AvatarStudioModal } from './AvatarStudioModal';

interface AvatarStudioLauncherProps extends AvatarStudioOptions {
  readonly className?: string;
  readonly label?: string;
  readonly icon?: ReactNode;
  readonly testId?: string;
}

/** Self-contained entry point; hosts mount it without owning studio state. */
export function AvatarStudioLauncher({
  className,
  initialSprite,
  label = 'Avatar Studio',
  icon = <Crown className="h-3.5 w-3.5 text-[#f8e29b]" aria-hidden="true" />,
  testId = 'avatar-studio__launch',
}: AvatarStudioLauncherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback(() => setIsOpen(false), []);
  return (
    <>
      <Button className={className} onClick={() => setIsOpen(true)} aria-haspopup="dialog" data-testid={testId}>
        {icon}
        <span>{label}</span>
      </Button>
      <AvatarStudioModal open={isOpen} onClose={close} initialSprite={initialSprite} />
    </>
  );
}

const WEI_LING_SPRITE = { code: WEI_LING_AVATAR.sprite, label: WEI_LING_AVATAR.nickname };

/** Opens the studio with Wei_Ling's avatar already set in gold. */
export function WeiLingAvatarButton({ className }: { readonly className?: string }) {
  return (
    <AvatarStudioLauncher
      className={className}
      initialSprite={WEI_LING_SPRITE}
      label="Wei_Ling"
      icon={<UserRound className="h-3.5 w-3.5 text-[#f8e29b]" aria-hidden="true" />}
      testId="avatar-studio__launch-wei-ling"
    />
  );
}
