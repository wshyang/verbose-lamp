import { useEffect, useRef, type ChangeEvent } from 'react';
import { Download, ScanFace, Sparkles, Upload, User, X } from 'lucide-react';
import { GOLD_RAMPS } from '@/features/gilded-portrait';
import { Button, Dialog, IconButton, RangeInput } from '@/shared/ui';
import { ART_PALETTES } from '../data/artPalettes';
import { warmUpFaceDetector } from '../engine/faceDetection';
import { useAvatarStudio, type AvatarStudioState } from '../hooks/useAvatarStudio';
import type { BackdropPattern, GoldRampId, StudioSource } from '../types';
import { AvatarStudioCanvas } from './AvatarStudioCanvas';

/**
 * ADDENDUM-017 — the studio, as a surface.
 *
 * Everything here is presentation: the decisions live in `useAvatarStudio`, and the
 * picture lives in the engine. The controls are the beach app's, renamed for the house:
 * a sitter, a face, a ground, an artwork and a gold.
 */

interface AvatarStudioModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly source?: StudioSource;
}

const CHIP_BASE =
  'px-2.5 py-1 text-[10px] tracking-[0.16em] uppercase border transition-all whitespace-nowrap cursor-pointer';
const CHIP_IDLE =
  'bg-[#0d0a13]/70 border-[#d4af37]/25 text-[#d4af37]/80 hover:border-[#d4af37]/65 hover:text-[#fff4d4]';
const CHIP_ACTIVE =
  'bg-[#d4af37]/25 border-[#f8e29b] text-[#fff6dc] shadow-[0_0_14px_rgba(248,226,155,0.2)]';
const LABEL = 'block text-[10px] tracking-[0.26em] uppercase text-[#d4af37]';

const PATTERN_LABELS: readonly { readonly kind: BackdropPattern['kind']; readonly label: string }[] = [
  { kind: 'rays', label: 'Rays' },
  { kind: 'chevron', label: 'Chevron' },
  { kind: 'rings', label: 'Rings' },
  { kind: 'kaleidoscope', label: 'Kaleidoscope' },
];

const RAMP_LABELS: readonly { readonly id: GoldRampId; readonly label: string }[] = [
  { id: 'bright', label: 'Bullion' },
  { id: 'deep', label: 'Deep' },
  { id: 'champagne', label: 'Champagne' },
];

function chipClass(active: boolean): string {
  return `${CHIP_BASE} ${active ? CHIP_ACTIVE : CHIP_IDLE}`;
}

function faceMessage(studio: AvatarStudioState): string {
  if (studio.source === 'wei-ling') {
    return 'The house portrait is on the plate. Nothing to detect.';
  }
  if (studio.faceStatus === 'searching') return 'Looking for the face…';
  if (studio.faceStatus === 'found') {
    return 'The face was found; the portrait square is set from the eye line.';
  }
  if (studio.faceStatus === 'none') {
    return 'No face was found, so the square is an estimate from skin tone. Crop your photograph to the head before uploading.';
  }
  return 'Upload a photograph and the square is set from the face.';
}

function SourceRow({ studio }: { readonly studio: AvatarStudioState }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    void studio.loadFile(event.target.files?.[0] ?? null);
    event.target.value = '';
  };
  return (
    <div>
      <span className={LABEL}>The sitter</span>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Button
          size="small"
          className={chipClass(false)}
          onClick={() => inputRef.current?.click()}
          disabled={studio.isBusy}
          data-testid="avatar-studio__upload"
        >
          <Upload className="h-3 w-3" />
          Upload photograph
        </Button>
        <Button
          size="small"
          className={chipClass(studio.source === 'wei-ling')}
          aria-pressed={studio.source === 'wei-ling'}
          onClick={studio.showWeiLing}
          data-testid="avatar-studio__wei-ling"
        >
          <User className="h-3 w-3" />
          Wei_Ling
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPick}
          data-testid="avatar-studio__file-input"
        />
      </div>
      <p className="mt-2 text-[10px] leading-relaxed tracking-[0.1em] text-[#d4af37]/55">
        {faceMessage(studio)}
      </p>
      {studio.source === 'photograph' ? (
        <Button
          size="small"
          className={`${chipClass(false)} mt-2`}
          onClick={() => void studio.detectFaceNow()}
          disabled={studio.isBusy || studio.faceStatus === 'searching'}
          data-testid="avatar-studio__detect-face"
        >
          <ScanFace className="h-3 w-3" />
          Find the face again
        </Button>
      ) : null}
    </div>
  );
}

function groundMessage(studio: AvatarStudioState): string {
  if (studio.source === 'wei-ling') {
    return 'The house portrait was cut out when it was recorded. There is no ground to lift.';
  }
  if (studio.removeBackground) {
    return 'The sitter is cut away and the enamel is laid in behind them.';
  }
  return 'The whole square is kept, photograph and all.';
}

function GroundRow({ studio }: { readonly studio: AvatarStudioState }) {
  const canLift = studio.source === 'photograph' && studio.image !== null;
  return (
    <div>
      <span className={LABEL}>The ground</span>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Button
          size="small"
          className={chipClass(studio.removeBackground)}
          aria-pressed={studio.removeBackground}
          onClick={() => void studio.toggleBackground()}
          disabled={studio.isBusy || !canLift}
          data-testid="avatar-studio__background"
        >
          {studio.removeBackground ? 'Keep the ground' : 'Lift the ground'}
        </Button>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed tracking-[0.1em] text-[#d4af37]/55">
        {groundMessage(studio)}
      </p>
    </div>
  );
}

function ArtworkRow({ studio }: { readonly studio: AvatarStudioState }) {
  return (
    <div>
      <span className={LABEL}>The artwork</span>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {PATTERN_LABELS.map((option) => (
          <Button
            key={option.kind}
            size="small"
            className={chipClass(studio.pattern.kind === option.kind)}
            aria-pressed={studio.pattern.kind === option.kind}
            onClick={() => studio.setPattern(option.kind)}
            data-testid={`avatar-studio__pattern-${option.kind}`}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {ART_PALETTES.map((palette) => (
          <button
            key={palette.id}
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded-full border transition-all cursor-pointer"
            style={{
              background: `linear-gradient(135deg, ${palette.colours[0]}, ${palette.colours[1]} 50%, ${palette.colours[2]})`,
              borderColor:
                studio.paletteId === palette.id ? '#f8e29b' : 'rgba(212,175,55,0.3)',
              boxShadow:
                studio.paletteId === palette.id ? '0 0 12px rgba(248,226,155,0.45)' : 'none',
            }}
            aria-pressed={studio.paletteId === palette.id}
            aria-label={`Enamel: ${palette.name}`}
            title={palette.name}
            onClick={() => studio.setPaletteId(palette.id)}
            data-testid={`avatar-studio__palette-${palette.id}`}
          />
        ))}
      </div>
    </div>
  );
}

function GoldRow({ studio }: { readonly studio: AvatarStudioState }) {
  return (
    <div>
      <span className={LABEL}>The gold</span>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {RAMP_LABELS.map((option) => (
          <Button
            key={option.id}
            size="small"
            className={chipClass(studio.rampId === option.id)}
            aria-pressed={studio.rampId === option.id}
            onClick={() => studio.setRampId(option.id)}
            data-testid={`avatar-studio__ramp-${option.id}`}
          >
            {GOLD_RAMPS[option.id].name}
          </Button>
        ))}
      </div>
      <label className="mt-3 block">
        <span className={LABEL}>Gold share — {Math.round(studio.goldShare * 100)}%</span>
        <RangeInput
          className="mt-1.5"
          min={0}
          max={100}
          value={Math.round(studio.goldShare * 100)}
          onChange={(event) => studio.setGoldShare(Number(event.target.value) / 100)}
          data-testid="avatar-studio__gold-share"
        />
      </label>
      <label className="mt-2 block">
        <span className={LABEL}>Light — {Math.round(studio.sheen * 100)}%</span>
        <RangeInput
          className="mt-1.5"
          min={0}
          max={100}
          value={Math.round(studio.sheen * 100)}
          onChange={(event) => studio.setSheen(Number(event.target.value) / 100)}
          data-testid="avatar-studio__sheen"
        />
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Button
          size="small"
          className={chipClass(studio.gildSubject)}
          aria-pressed={studio.gildSubject}
          onClick={() => studio.setGildSubject(!studio.gildSubject)}
          data-testid="avatar-studio__gild-sitter"
        >
          Gild the sitter
        </Button>
        <Button
          size="small"
          className={chipClass(studio.rim)}
          aria-pressed={studio.rim}
          onClick={() => studio.setRim(!studio.rim)}
          data-testid="avatar-studio__rim"
        >
          Raised rim
        </Button>
        <Button
          size="small"
          className={chipClass(studio.shimmer)}
          aria-pressed={studio.shimmer}
          onClick={() => studio.setShimmer(!studio.shimmer)}
          data-testid="avatar-studio__shimmer"
        >
          Shimmer
        </Button>
      </div>
    </div>
  );
}

export function AvatarStudioModal({ open, onClose, source = 'photograph' }: AvatarStudioModalProps) {
  const studio = useAvatarStudio(source);

  /**
   * The detector's weights are fetched when the studio opens, not when the page loads:
   * a title sequence has no business downloading a face model for a visitor who never
   * opens the studio.
   */
  useEffect(() => {
    if (open) warmUpFaceDetector();
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="avatar-studio-title"
      testId="avatar-studio"
      className="deco-scroll max-h-[92vh] w-[min(1080px,96vw)] overflow-y-auto border border-[#d4af37]/35 bg-[#08060c]/95 p-5 shadow-[0_30px_90px_rgba(0,0,0,0.7)] sm:p-7"
    >
      <header className="flex items-start justify-between gap-4 border-b border-[#d4af37]/20 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#f8e29b]" />
            <h2
              id="avatar-studio-title"
              className="font-deco text-sm tracking-[0.26em] uppercase text-[#fff6dc]"
            >
              The Gold Avatar Studio
            </h2>
          </div>
          <p className="mt-1.5 text-[10px] tracking-[0.14em] text-[#d4af37]/60">
            A face found, a ground lifted, and the whole of it laid into a gold plate.
          </p>
        </div>
        <IconButton
          onClick={onClose}
          label="Close the avatar studio"
          icon={<X className="h-3.5 w-3.5 text-[#d4af37]" />}
          data-testid="avatar-studio__close"
        />
      </header>

      <div className="mt-5 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div>
          <AvatarStudioCanvas
            image={studio.plate}
            label="The gold plate, with the sitter inlaid"
            isShimmering={studio.shimmer}
          />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              size="small"
              variant="accent"
              className="border border-[#f8e29b]/60"
              onClick={() => void studio.downloadPng()}
              disabled={studio.plate === null}
              data-testid="avatar-studio__export"
            >
              <Download className="h-3 w-3" />
              Take the plate
            </Button>
            {studio.isBusy ? (
              <span className="text-[10px] tracking-[0.18em] uppercase text-[#d4af37]/60">
                Working…
              </span>
            ) : null}
          </div>
          {studio.error ? (
            <p
              className="mt-3 text-[10px] leading-relaxed tracking-[0.1em] text-[#e8a0a0]"
              data-testid="avatar-studio__error"
            >
              {studio.error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-5">
          <SourceRow studio={studio} />
          <GroundRow studio={studio} />
          <ArtworkRow studio={studio} />
          <GoldRow studio={studio} />
        </div>
      </div>
    </Dialog>
  );
}
