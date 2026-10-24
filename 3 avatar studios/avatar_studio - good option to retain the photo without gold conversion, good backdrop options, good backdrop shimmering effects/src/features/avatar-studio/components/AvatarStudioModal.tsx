import { useRef } from 'react';
import { Download, Upload, UserRound, X } from 'lucide-react';
import { Button, Dialog, IconButton } from '@/shared/ui';
import { useAvatarStudio, type AvatarStudioOptions } from '../hooks/useAvatarStudio';
import { BackgroundControls, FinishRow, PaletteRow, PatternRow } from './StudioControls';
import { ShimmerCanvas } from './ShimmerCanvas';

interface AvatarStudioModalProps extends AvatarStudioOptions {
  readonly open: boolean;
  readonly onClose: () => void;
}

const ACTION = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] tracking-[0.16em] uppercase';

function StudioBody({ onClose, initialSprite }: Omit<AvatarStudioModalProps, 'open'>) {
  const studio = useAvatarStudio({ initialSprite });
  const fileRef = useRef<HTMLInputElement | null>(null);
  const previewLabel = studio.subject ? `${studio.subject.label} in gold` : 'Gold backdrop preview';

  return (
    <>
      <header className="flex items-start justify-between gap-4 border-b border-[#d4af37]/25 px-5 py-4">
        <div>
          <h2 id="avatar-studio-title" className="font-display text-lg tracking-[0.3em] text-[#f8e29b] uppercase">Gold Avatar Studio</h2>
          <p className="mt-1 text-xs text-[#fff4d4]/60">Face found, background lifted, set in enamelled gold.</p>
        </div>
        <IconButton label="Close avatar studio" icon={<X className="h-4 w-4" />} onClick={onClose} data-testid="avatar-studio__close" />
      </header>
      <div className="grid gap-5 overflow-y-auto p-5 md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3">
          <div className="relative mx-auto aspect-square w-full max-w-[460px] overflow-hidden border border-[#d4af37]/40 bg-black shadow-[0_0_40px_rgba(212,175,55,0.15)]">
            <ShimmerCanvas frames={studio.frames} label={previewLabel} />
          </div>
          <p className="min-h-4 text-center text-xs text-[#fff4d4]/70" role="status" data-testid="avatar-studio__status">{studio.note}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
              onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void studio.loadPhoto(file); event.currentTarget.value = ''; }}
              data-testid="avatar-studio__file" />
            <Button className={ACTION} disabled={studio.isBusy} onClick={() => fileRef.current?.click()} data-testid="avatar-studio__upload">
              <Upload className="h-3.5 w-3.5" aria-hidden="true" /> Photograph
            </Button>
            <Button className={ACTION} disabled={studio.isBusy} onClick={studio.loadWeiLing} data-testid="avatar-studio__wei-ling">
              <UserRound className="h-3.5 w-3.5" aria-hidden="true" /> Wei_Ling
            </Button>
            <Button className={ACTION} onClick={() => void studio.download()} data-testid="avatar-studio__download">
              <Download className="h-3.5 w-3.5" aria-hidden="true" /> PNG
            </Button>
          </div>
        </div>
        <div className="space-y-4">
          <PatternRow studio={studio} />
          <PaletteRow studio={studio} />
          <FinishRow studio={studio} />
          <BackgroundControls studio={studio} />
        </div>
      </div>
    </>
  );
}

/** Self-contained dialog; the studio session is created fresh on every open. */
export function AvatarStudioModal({ open, onClose, initialSprite }: AvatarStudioModalProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="avatar-studio-title"
      testId="avatar-studio__dialog"
      className="flex max-h-[92vh] w-full max-w-4xl flex-col border border-[#d4af37]/40 bg-[#0b0810]/95 text-[#fff4d4]"
    >
      {open && <StudioBody onClose={onClose} initialSprite={initialSprite} />}
    </Dialog>
  );
}
