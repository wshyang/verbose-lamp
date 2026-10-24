import { useState } from 'react';
import { Sparkles, User } from 'lucide-react';
import { Button } from '@/shared/ui';
import type { StudioSource } from '../types';
import { AvatarStudioModal } from './AvatarStudioModal';

/**
 * ADDENDUM-017 — the studio's doors.
 *
 * Two of them, because the beach app's studio had one: any photograph you brought, and
 * the house sitter. The Wei_Ling button opens the studio already holding Wei_Ling's
 * portrait, gold plate and all.
 */
export function AvatarStudioLauncher() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<StudioSource>('photograph');
  const [session, setSession] = useState(0);

  /**
   * Each opening is a new session, so the studio never reopens holding the last
   * sitter: the door you came through decides what is on the plate.
   */
  const openWith = (next: StudioSource) => {
    setMode(next);
    setSession((count) => count + 1);
    setOpen(true);
  };

  return (
    <>
      <Button
        onClick={() => openWith('photograph')}
        data-testid="premiere-header__avatar-studio"
        title="Open the Gold Avatar Studio"
      >
        <Sparkles className="h-3.5 w-3.5 text-[#f8e29b]" />
        <span className="hidden sm:inline">Avatar Studio</span>
        <span className="sm:hidden">Studio</span>
      </Button>
      <Button
        onClick={() => openWith('wei-ling')}
        data-testid="premiere-header__wei-ling"
        title="Show Wei_Ling's portrait, gilded"
      >
        <User className="h-3.5 w-3.5 text-[#f8e29b]" />
        <span>Wei_Ling</span>
      </Button>
      <AvatarStudioModal
        key={`${mode}-${session}`}
        open={open}
        onClose={() => setOpen(false)}
        source={mode}
      />
    </>
  );
}
