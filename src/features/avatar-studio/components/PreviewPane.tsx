import { useRef } from 'react';
import { Crop, Download, Image as ImageIcon, Upload, UserRound } from 'lucide-react';
import { Button } from '@/shared/ui';
import { WEI_LING } from '../data/samples';
import type { AvatarStudioState } from '../hooks/useAvatarStudio';
import { PhotoCropper } from './PhotoCropper';
import { ShimmerCanvas } from './ShimmerCanvas';
import { ACTION, NOTE } from './studioUi';

const SECONDARY = `${ACTION} border-[#d4af37]/30 text-[#d4af37]/85 hover:border-[#f8e29b] hover:text-[#fff4d4]`;
const PRIMARY = `${ACTION} border-[#f8e29b]/70 bg-[#d4af37]/20 text-[#fff6dc] hover:bg-[#d4af37]/35`;

function Preview({ studio }: { readonly studio: AvatarStudioState }) {
  const { session } = studio;
  if (session.isCropping && session.photo && session.cropperStart) {
    return <PhotoCropper photo={session.photo} initial={session.cropperStart} onConfirm={session.confirmCrop} onCancel={session.cancelCrop} />;
  }
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[420px]" data-testid="avatar-studio__preview">
      <ShimmerCanvas frames={studio.previewFrames} label="Gilded avatar preview" testId="avatar-studio__preview-canvas" />
    </div>
  );
}

function SourceActions({ studio }: { readonly studio: AvatarStudioState }) {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const { session } = studio;
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <input
        ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true"
        onChange={(event) => { void session.loadFile(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = ''; }}
        data-testid="avatar-studio__file-input"
      />
      <Button type="button" onClick={() => fileInput.current?.click()} variant="panel" size="compact" className={SECONDARY} data-testid="avatar-studio__choose-image">
        <Upload className="h-3.5 w-3.5" />
        Choose image
      </Button>
      <Button type="button" onClick={studio.showWeiLing} variant="panel" size="compact" className={SECONDARY} title={WEI_LING.persona} data-testid="avatar-studio__sample-wei-ling">
        <UserRound className="h-3.5 w-3.5" />
        Show {WEI_LING.name}
      </Button>
      <Button type="button" onClick={session.startAdjusting} disabled={!session.photo || session.isCropping} variant="panel" size="compact" className={SECONDARY} data-testid="avatar-studio__adjust-framing">
        <Crop className="h-3.5 w-3.5" />
        Adjust framing
      </Button>
      <Button type="button" onClick={() => void studio.downloadPng()} disabled={!studio.canDownload || studio.isExporting} variant="selected" size="compact" className={PRIMARY} data-testid="avatar-studio__download-png">
        {studio.isExporting ? <ImageIcon className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
        {studio.isExporting ? 'Preparing PNG' : 'Download PNG'}
      </Button>
    </div>
  );
}

export function PreviewPane({ studio }: { readonly studio: AvatarStudioState }) {
  const { session } = studio;
  const message = session.error ?? studio.exportError ?? session.hint;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Preview studio={studio} />
      <p
        role="status" aria-live="polite" data-testid="avatar-studio__state"
        className={`text-center font-editorial text-sm ${session.error ? 'text-[#f3a6a0]' : 'text-[#fff4d4]/80'}`}
      >
        {message}
      </p>
      <SourceActions studio={studio} />
      <p className={`${NOTE} text-center`}>
        Your photo stays in this browser. The first run downloads the face and background tools, which are then cached. The PNG is a still image; the sheen is preview only.
      </p>
    </div>
  );
}
