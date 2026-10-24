import { ScanFace, Sparkles } from 'lucide-react';
import { Button } from '@/shared/ui';
import { ART_BACKDROPS } from './artBackdrop';
import type { GildedPortraitState } from './useGildedPortrait';

const LABEL = 'block text-[10px] tracking-[0.26em] uppercase text-[#d4af37]';
const CHIP = 'px-2.5 py-1 text-[10px] tracking-[0.14em] uppercase border transition-all cursor-pointer';

const STATUS_COPY = {
  idle: 'Choose a portrait to begin.',
  'detecting-face': 'Finding the face...',
  'removing-background': 'Face pass complete. Removing the background...',
  ready: 'Face framed and background removed locally.',
  fallback: 'Best available cutout used. A plain background gives the cleanest result.',
} as const;

function analysisCopy(portrait: GildedPortraitState): string {
  if (portrait.analysisStatus === 'ready' && !portrait.faceDetection) {
    return 'Background removed. No face was confidently located.';
  }
  if (portrait.analysisStatus === 'fallback' && !portrait.faceDetection) {
    return 'No face was confidently located. A plain background gives the cleanest cutout.';
  }
  return STATUS_COPY[portrait.analysisStatus];
}

export function FaceDetectionOverlay({ portrait }: { readonly portrait: GildedPortraitState }) {
  const face = portrait.faceDetection;
  const image = portrait.sourceImage;
  if (!face || !image || !portrait.isShowingOriginal) return null;
  const style = {
    left: `${face.box.x / image.width * 100}%`,
    top: `${face.box.y / image.height * 100}%`,
    width: `${face.box.width / image.width * 100}%`,
    height: `${face.box.height / image.height * 100}%`,
  };
  return (
    <div
      className="pointer-events-none absolute border border-[#fff1ad] shadow-[0_0_18px_rgba(248,226,155,0.65),inset_0_0_18px_rgba(248,226,155,0.12)]"
      style={style}
      data-testid="gilded-portrait__face-box"
      aria-hidden="true"
    >
      <span className="absolute -left-px -top-5 bg-[#09070c]/90 px-1.5 py-0.5 text-[8px] tracking-[0.2em] text-[#fff1ad] uppercase">
        Face found
      </span>
    </div>
  );
}

export function PortraitAnalysisReadout({ portrait }: { readonly portrait: GildedPortraitState }) {
  return (
    <div className="flex items-start gap-2 border-l border-[#d4af37]/45 pl-3" role="status" data-testid="gilded-portrait__analysis-status">
      <ScanFace className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#f8e29b]" aria-hidden="true" />
      <p className="font-editorial text-xs italic leading-relaxed text-[#e9d9b8]/70">
        {analysisCopy(portrait)}
      </p>
    </div>
  );
}

export function AvatarIntelligenceControls({ portrait }: { readonly portrait: GildedPortraitState }) {
  return (
    <div className="space-y-4 border-y border-[#d4af37]/15 py-4">
      <div>
        <span className={LABEL}>Art backdrop</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {ART_BACKDROPS.map((backdrop) => (
            <Button
              key={backdrop.id}
              type="button"
              onClick={() => portrait.setBackdropId(backdrop.id)}
              variant={portrait.backdropId === backdrop.id ? 'selected' : 'panel'}
              className={`${CHIP} gap-2`}
              aria-pressed={portrait.backdropId === backdrop.id}
              data-testid="gilded-portrait__backdrop-style"
            >
              <span className="h-2.5 w-2.5 border border-[#f8e29b]/60" style={{ backgroundColor: backdrop.colour }} />
              {backdrop.name}
            </Button>
          ))}
        </div>
      </div>
      <Button
        type="button"
        onClick={() => portrait.setBackgroundRemoved(!portrait.isBackgroundRemoved)}
        disabled={!portrait.sourceImage}
        variant={portrait.isBackgroundRemoved ? 'selected' : 'panel'}
        className={`${CHIP} inline-flex items-center gap-2`}
        aria-pressed={portrait.isBackgroundRemoved}
        data-testid="gilded-portrait__remove-background"
      >
        <Sparkles className="h-3 w-3" aria-hidden="true" />
        {portrait.isBackgroundRemoved ? 'Background removed' : 'Keep original background'}
      </Button>
      <PortraitAnalysisReadout portrait={portrait} />
    </div>
  );
}