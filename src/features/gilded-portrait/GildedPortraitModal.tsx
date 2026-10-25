import { useRef, type ChangeEvent, type RefObject } from 'react';
import { Download, Image as ImageIcon, Sparkles, Upload, X } from 'lucide-react';
import { Button, Dialog, IconButton, RangeInput } from '@/shared/ui';
import { GILDING_PRESETS } from './presets';
import { GOLD_RAMPS } from '@/shared/lib/goldRamp';
import { GildedPortraitCanvas } from './GildedPortraitCanvas';
import { useGildedPortrait } from './useGildedPortrait';
import type { GildedPortraitState } from './useGildedPortrait';
import type { MaskShape } from './types';

interface GildedPortraitModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

const CHIP_BASE = 'px-2.5 py-1 text-[10px] tracking-[0.16em] uppercase border transition-all whitespace-nowrap cursor-pointer';
const CHIP_IDLE = 'bg-[#0d0a13]/70 border-[#d4af37]/25 text-[#d4af37]/80 hover:border-[#d4af37]/65 hover:text-[#fff4d4]';
const CHIP_ACTIVE = 'bg-[#d4af37]/25 border-[#f8e29b] text-[#fff6dc] shadow-[0_0_14px_rgba(248,226,155,0.2)]';
const LABEL = 'block text-[10px] tracking-[0.26em] uppercase text-[#d4af37]';
const ACTION = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] tracking-[0.16em] uppercase border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

const MASK_OPTIONS: readonly { readonly shape: MaskShape; readonly label: string }[] = [
  { shape: 'none', label: 'Full frame' },
  { shape: 'oval', label: 'Oval' },
  { shape: 'rounded-rect', label: 'Rounded' },
];

type PortraitState = GildedPortraitState;

function PresetRow({ portrait }: { readonly portrait: PortraitState }) {
  return (
    <div>
      <span className={LABEL}>Finish</span>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {GILDING_PRESETS.map((preset) => (
          <Button
            key={preset.id}
            type="button"
            onClick={() => portrait.applyPreset(preset)}
            variant={portrait.activePresetId === preset.id ? 'selected' : 'panel'}
            size="small"
            className={`${CHIP_BASE} ${portrait.activePresetId === preset.id ? CHIP_ACTIVE : CHIP_IDLE}`}
            aria-pressed={portrait.activePresetId === preset.id}
            data-testid="gilded-portrait__preset"
          >
            {preset.name}
          </Button>
        ))}
      </div>
    </div>
  );
}

interface RangeControlProps {
  readonly id: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly displayValue: string;
  readonly testId: string;
  readonly onChange: (value: number) => void;
}

function RangeControl({ id, label, min, max, step, value, displayValue, testId, onChange }: RangeControlProps) {
  return (
    <label htmlFor={id} className="block">
      <span className="flex items-center justify-between gap-3">
        <span className={LABEL}>{label}</span>
        <span className="font-editorial text-xs tabular-nums text-[#fff4d4]/75">{displayValue}</span>
      </span>
      <RangeInput
        id={id}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        aria-label={label}
        className="mt-3 rounded-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f8e29b] focus-visible:outline-offset-4"
        data-testid={testId}
      />
    </label>
  );
}

function RampRow({ portrait }: { readonly portrait: PortraitState }) {
  const ramps = Object.values(GOLD_RAMPS);
  return (
    <div>
      <span className={LABEL}>Gold tone</span>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {ramps.map((ramp) => (
          <Button
            key={ramp.id}
            type="button"
            onClick={() => portrait.setRamp(ramp.id)}
            variant={portrait.params.rampId === ramp.id ? 'selected' : 'panel'}
            size="small"
            className={`${CHIP_BASE} ${portrait.params.rampId === ramp.id ? CHIP_ACTIVE : CHIP_IDLE} gap-2`}
            aria-pressed={portrait.params.rampId === ramp.id}
            data-testid="gilded-portrait__ramp"
          >
            <span
              aria-hidden="true"
              className="h-2 w-7 border border-[#fff6dc]/25"
              style={{ background: `linear-gradient(90deg, ${ramp.stops[0].color}, ${ramp.stops[ramp.stops.length - 1].color})` }}
            />
            {ramp.name}
          </Button>
        ))}
      </div>
    </div>
  );
}

function MaskRow({ portrait }: { readonly portrait: PortraitState }) {
  return (
    <div>
      <span className={LABEL}>Silhouette</span>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {MASK_OPTIONS.map((option) => (
          <Button
            key={option.shape}
            type="button"
            onClick={() => portrait.setMaskShape(option.shape)}
            variant={portrait.params.mask.shape === option.shape ? 'selected' : 'panel'}
            size="small"
            className={`${CHIP_BASE} ${portrait.params.mask.shape === option.shape ? CHIP_ACTIVE : CHIP_IDLE}`}
            aria-pressed={portrait.params.mask.shape === option.shape}
            data-testid="gilded-portrait__mask"
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function PreviewArtwork({ portrait }: { readonly portrait: PortraitState }) {
  const shownImage = portrait.isShowingOriginal ? portrait.sourceImage : portrait.gildedImage;
  const previewLabel = portrait.isShowingOriginal ? 'Original image preview' : 'Gilded image preview';

  return (
    <div className="relative aspect-square overflow-hidden border border-[#d4af37]/35 bg-[radial-gradient(ellipse_at_center,#17110a_0%,#050406_72%)] shadow-[0_0_40px_rgba(212,175,55,0.1)]">
      {shownImage ? (
        <GildedPortraitCanvas
          image={shownImage}
          label={previewLabel}
          isShimmering={!portrait.isShowingOriginal && portrait.isShimmering}
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center px-8 text-center">
          <ImageIcon className="h-8 w-8 text-[#d4af37]/65" aria-hidden="true" />
          <p className="mt-4 max-w-[18rem] font-editorial text-lg italic leading-snug text-[#fff4d4]/80">
            Bring a photograph or object into the light.
          </p>
          <p className="mt-2 text-[9px] tracking-[0.22em] uppercase text-[#d4af37]/65">
            JPEG · PNG · WEBP · up to 25 MB
          </p>
        </div>
      )}
      {portrait.isLoading && (
        <div role="status" className="absolute inset-0 flex items-center justify-center bg-[#050406]/70 text-[10px] tracking-[0.24em] uppercase text-[#f8e29b]">
          Preparing image
        </div>
      )}
    </div>
  );
}

interface PreviewActionsProps {
  readonly portrait: PortraitState;
  readonly fileInputRef: RefObject<HTMLInputElement | null>;
  readonly onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

function PreviewActions({ portrait, fileInputRef, onFileChange }: PreviewActionsProps) {
  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={onFileChange}
        aria-label="Choose an image to gild"
        hidden
        data-testid="gilded-portrait__file-input"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          variant="panel"
          size="compact"
          className={`${ACTION} border-[#d4af37]/45 bg-[#0a080f]/80 text-[#fff4d4] hover:border-[#f8e29b]`}
          data-testid="gilded-portrait__choose-image"
        >
          <Upload className="h-3.5 w-3.5 text-[#f8e29b]" />
          Choose image
        </Button>
        <Button
          type="button"
          onClick={() => portrait.setShowingOriginal(!portrait.isShowingOriginal)}
          disabled={!portrait.sourceImage}
          variant="panel"
          size="compact"
          className={`${ACTION} border-[#d4af37]/30 text-[#d4af37] hover:border-[#f8e29b] hover:text-[#fff4d4]`}
          aria-pressed={portrait.isShowingOriginal}
          data-testid="gilded-portrait__compare"
        >
          {portrait.isShowingOriginal ? 'View gold' : 'View original'}
        </Button>
        {portrait.sourceName && (
          <span className="min-w-0 truncate font-editorial text-xs italic text-[#e0cfa9]/55">
            {portrait.sourceName}
          </span>
        )}
      </div>
    </>
  );
}

function PreviewPane({ portrait }: { readonly portrait: PortraitState }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void portrait.loadFile(event.currentTarget.files?.[0] ?? null);
    event.currentTarget.value = '';
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PreviewArtwork portrait={portrait} />
      <PreviewActions portrait={portrait} fileInputRef={fileInputRef} onFileChange={handleFileChange} />
      {portrait.error && <p role="alert" className="border-l border-[#f8e29b]/55 pl-3 font-editorial text-sm text-[#ffe8c2]" data-testid="gilded-portrait__error">{portrait.error}</p>}
    </div>
  );
}

function ToneControls({ portrait }: { readonly portrait: PortraitState }) {
  return (
    <div className="space-y-4 border-y border-[#d4af37]/15 py-4">
      <RangeControl
        id="gilded-clarity"
        label="Clarity"
        min={0}
        max={160}
        step={1}
        value={Math.round(portrait.params.clarity * 100)}
        displayValue={`${Math.round(portrait.params.clarity * 100)}%`}
        testId="gilded-portrait__clarity"
        onChange={(value) => portrait.setClarity(value / 100)}
      />
      <RangeControl
        id="gilded-levels"
        label="Levels"
        min={0}
        max={100}
        step={1}
        value={portrait.params.levels}
        displayValue={`${Math.round(portrait.params.levels)}%`}
        testId="gilded-portrait__levels"
        onChange={portrait.setLevels}
      />
      <RangeControl
        id="gilded-folds"
        label="Specular folds"
        min={0}
        max={4}
        step={1}
        value={portrait.params.folds}
        displayValue={String(portrait.params.folds)}
        testId="gilded-portrait__folds"
        onChange={portrait.setFolds}
      />
    </div>
  );
}

function PreviewToggles({ portrait }: { readonly portrait: PortraitState }) {
  return (
    <Button
      type="button"
      onClick={() => portrait.setShimmering(!portrait.isShimmering)}
      variant={portrait.isShimmering ? 'selected' : 'panel'}
      size="small"
      className={`${CHIP_BASE} ${portrait.isShimmering ? CHIP_ACTIVE : CHIP_IDLE} inline-flex items-center gap-1.5`}
      aria-pressed={portrait.isShimmering}
      data-testid="gilded-portrait__shimmer"
    >
      <Sparkles className="h-3 w-3" />
      Sheen
    </Button>
  );
}

function DownloadButton({ portrait }: { readonly portrait: PortraitState }) {
  return (
    <Button
      type="button"
      onClick={() => void portrait.downloadPng()}
      disabled={!portrait.gildedImage || portrait.isExporting}
      variant="selected"
      size="compact"
      className={`${ACTION} border-[#f8e29b]/70 bg-[#d4af37]/20 text-[#fff6dc] hover:bg-[#d4af37]/35`}
      data-testid="gilded-portrait__download-png"
    >
      {portrait.isExporting ? <ImageIcon className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
      {portrait.isExporting ? 'Preparing PNG' : 'Download PNG'}
    </Button>
  );
}

function ControlsPane({ portrait }: { readonly portrait: PortraitState }) {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PresetRow portrait={portrait} />
      <ToneControls portrait={portrait} />
      <RampRow portrait={portrait} />
      <MaskRow portrait={portrait} />
      <div className="flex flex-wrap gap-2 border-t border-[#d4af37]/15 pt-4">
        <PreviewToggles portrait={portrait} />
        <DownloadButton portrait={portrait} />
      </div>
      <p className="font-editorial text-xs italic leading-relaxed text-[#e0cfa9]/55">
        Your source stays in this browser. Export is a still image; the moving sheen is preview only.
      </p>
    </div>
  );
}

export function GildedPortraitModal({ open, onClose }: GildedPortraitModalProps) {
  const portrait = useGildedPortrait();
  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="gilded-portrait-title"
      className="relative max-h-[92dvh] w-full max-w-5xl overflow-y-auto border border-[#d4af37]/50 bg-[#09070c]/96 p-5 shadow-[0_0_70px_rgba(212,175,55,0.18)] deco-scroll sm:p-7"
      backdropClassName="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md sm:p-5"
      testId="gilded-portrait__backdrop"
    >
      <span className="pointer-events-none absolute left-2 top-2 h-4 w-4 border-l-2 border-t-2 border-[#f8e29b]/70" />
      <span className="pointer-events-none absolute right-2 top-2 h-4 w-4 border-r-2 border-t-2 border-[#f8e29b]/70" />
      <span className="pointer-events-none absolute bottom-2 left-2 h-4 w-4 border-b-2 border-l-2 border-[#f8e29b]/70" />
      <span className="pointer-events-none absolute bottom-2 right-2 h-4 w-4 border-b-2 border-r-2 border-[#f8e29b]/70" />

      <div className="mb-5 flex items-start justify-between border-b border-[#d4af37]/25 pb-4">
        <div>
          <div className="text-[9px] tracking-[0.32em] uppercase text-[#d4af37]">A portrait in precious light</div>
          <h2 id="gilded-portrait-title" className="mt-1 font-deco text-lg tracking-[0.14em] text-[#fff4d4] sm:text-xl">
            GILDED PORTRAIT
          </h2>
        </div>
        <IconButton
          type="button"
          onClick={onClose}
          label="Close Gilded Portrait"
          icon={<X className="h-4 w-4" />}
          className="border-[#d4af37]/30 p-1.5 text-[#d4af37]/80 hover:border-[#f8e29b] hover:text-[#fff4d4]"
          data-testid="gilded-portrait__close"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(260px,0.9fr)_minmax(300px,1.1fr)] md:gap-8">
        <PreviewPane portrait={portrait} />
        <ControlsPane portrait={portrait} />
      </div>
    </Dialog>
  );
}