import { X } from 'lucide-react';
import { Dialog, IconButton } from '@/shared/ui';
import { useAvatarStudio } from '../hooks/useAvatarStudio';
import { BackdropControls } from './BackdropControls';
import { CutOutControls } from './CutOutControls';
import { PreviewPane } from './PreviewPane';
import { SubjectControls } from './SubjectControls';

interface AvatarStudioModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

const BRACKETS = [
  'left-2 top-2 border-l-2 border-t-2',
  'right-2 top-2 border-r-2 border-t-2',
  'bottom-2 left-2 border-b-2 border-l-2',
  'bottom-2 right-2 border-b-2 border-r-2',
] as const;

/** Mounted only while open, so the models warm up when the studio opens and the session resets on close. */
function AvatarStudioDialog({ onClose }: { readonly onClose: () => void }) {
  const studio = useAvatarStudio();
  return (
    <Dialog
      open
      onClose={onClose}
      labelledBy="avatar-studio-title"
      className="relative max-h-[94dvh] w-full max-w-6xl overflow-y-auto border border-[#d4af37]/50 bg-[#09070c]/96 p-5 shadow-[0_0_70px_rgba(212,175,55,0.18)] deco-scroll sm:p-7"
      backdropClassName="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md sm:p-5"
      testId="avatar-studio__overlay"
    >
      {BRACKETS.map((position) => (
        <span key={position} aria-hidden="true" className={`pointer-events-none absolute h-4 w-4 border-[#f8e29b]/70 ${position}`} />
      ))}
      <div className="mb-5 flex items-start justify-between border-b border-[#d4af37]/25 pb-4">
        <div>
          <div className="text-[9px] tracking-[0.32em] uppercase text-[#d4af37]">Cloisonné enamel, set in gold</div>
          <h2 id="avatar-studio-title" className="mt-1 font-deco text-lg tracking-[0.14em] text-[#fff4d4] sm:text-xl">GILDED AVATAR STUDIO</h2>
        </div>
        <IconButton
          type="button" onClick={onClose} label="Close Avatar Studio" icon={<X className="h-4 w-4" />}
          className="border-[#d4af37]/30 p-1.5 text-[#d4af37]/80 hover:border-[#f8e29b] hover:text-[#fff4d4]"
          data-testid="avatar-studio__close"
        />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(280px,0.95fr)_minmax(320px,1.05fr)] md:gap-8">
        <div className="md:sticky md:top-0 md:self-start">
          <PreviewPane studio={studio} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <SubjectControls look={studio.look} />
          <CutOutControls look={studio.look} availability={studio.session.cutOut} />
          <BackdropControls look={studio.look} />
        </div>
      </div>
    </Dialog>
  );
}

export function AvatarStudioModal({ open, onClose }: AvatarStudioModalProps) {
  if (!open) return null;
  return <AvatarStudioDialog onClose={onClose} />;
}
