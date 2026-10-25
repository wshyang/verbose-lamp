import React from 'react';
import { Download, Image as ImageIcon, Sparkles, X } from 'lucide-react';
import { GoldenQrCode } from './GoldenQrCode';
import { MAX_QR_CAPTION_LENGTH, QR_ERROR_CORRECTION_OPTIONS, QR_PRESETS, QR_SHAPE_OPTIONS } from './presets';
import { MAX_QR_TEXT_LENGTH } from './encode';
import { useQrGenerator } from './useQrGenerator';
import { Button, Dialog, IconButton } from '@/shared/ui';

interface QrGeneratorModalProps {
  open: boolean;
  onClose: () => void;
}

const CHIP_BASE =
  'px-2.5 py-1 text-[10px] tracking-[0.18em] uppercase border transition-all whitespace-nowrap cursor-pointer';
const CHIP_IDLE = 'bg-[#0d0a13]/70 border-[#d4af37]/25 text-[#d4af37]/80 hover:border-[#d4af37]/65 hover:text-[#f5e7c6]';
const CHIP_ACTIVE = 'bg-[#d4af37]/25 border-[#f8e29b] text-[#fff6dc] shadow-[0_0_14px_rgba(248,226,155,0.25)]';
const FIELD =
  'w-full bg-[#0d0a13]/80 border border-[#d4af37]/30 focus:border-[#f8e29b] outline-none px-3 py-2 text-sm font-editorial text-[#fff4d4] placeholder:text-[#d4af37]/35 transition-colors';
const LABEL = 'block text-[10px] tracking-[0.28em] uppercase text-[#d4af37] mb-1.5';
const ACTION =
  'inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] tracking-[0.18em] uppercase border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

const CornerBrackets: React.FC = () => (
  <>
    <span className="pointer-events-none absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-[#f8e29b]/70" />
    <span className="pointer-events-none absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-[#f8e29b]/70" />
    <span className="pointer-events-none absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-[#f8e29b]/70" />
    <span className="pointer-events-none absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-[#f8e29b]/70" />
  </>
);

type Generator = ReturnType<typeof useQrGenerator>;

const PreviewPane: React.FC<{ qr: Generator }> = ({ qr }) => (
  <div className="flex flex-col items-center gap-3">
    <div className="w-full max-w-[340px] aspect-square border border-[#d4af37]/35 shadow-[0_0_50px_rgba(212,175,55,0.18)] bg-[#050406] flex items-center justify-center">
      {qr.plan ? (
        <GoldenQrCode
          plan={qr.plan}
          caption={qr.caption}
          isShimmering={qr.isShimmering}
          svgRef={qr.svgRef}
          className="w-full h-full"
          testId="qr-generator__preview"
        />
      ) : (
        <p className="px-6 text-center text-sm font-editorial italic text-[#e0cfa9]/70" data-testid="qr-generator__error">
          {qr.error}
        </p>
      )}
    </div>
    <div className="text-[10px] tracking-[0.22em] uppercase text-[#d4af37]/70 tabular-nums" data-testid="qr-generator__summary">
      {qr.summary
        ? `Version ${qr.summary.version} · ${qr.summary.size}×${qr.summary.size} modules · ${qr.summary.byteCount} bytes`
        : 'Awaiting inscription'}
    </div>
  </div>
);

const PresetRow: React.FC<{ qr: Generator }> = ({ qr }) => (
  <div>
    <span className={LABEL}>Invitations</span>
    <div className="flex flex-wrap gap-1.5">
      {QR_PRESETS.map((preset) => (
        <Button
          key={preset.id}
          type="button"
          onClick={() => qr.applyPreset(preset)}
          variant={qr.activePresetId === preset.id ? 'selected' : 'panel'}
          size="small"
          className={`${CHIP_BASE} ${qr.activePresetId === preset.id ? CHIP_ACTIVE : CHIP_IDLE}`}
          data-testid="qr-generator__preset"
        >
          {preset.name}
        </Button>
      ))}
    </div>
  </div>
);

const CorrectionRow: React.FC<{ qr: Generator }> = ({ qr }) => (
  <div>
    <span className={LABEL}>Error correction</span>
    <div className="flex flex-wrap gap-1.5">
      {QR_ERROR_CORRECTION_OPTIONS.map((option) => (
        <Button
          key={option.level}
          type="button"
          onClick={() => qr.setErrorCorrection(option.level)}
          variant={qr.errorCorrection === option.level ? 'selected' : 'panel'}
          size="small"
          className={`${CHIP_BASE} ${qr.errorCorrection === option.level ? CHIP_ACTIVE : CHIP_IDLE}`}
          title={`Recovers up to ${option.recovery} damage`}
          data-testid="qr-generator__ec-level"
        >
          {option.level} · {option.label}
        </Button>
      ))}
    </div>
  </div>
);

const ShapeRow: React.FC<{ qr: Generator }> = ({ qr }) => (
  <div>
    <span className={LABEL}>Module cut</span>
    <div className="flex flex-wrap gap-1.5">
      {QR_SHAPE_OPTIONS.map((option) => (
        <Button
          key={option.shape}
          type="button"
          onClick={() => qr.setShape(option.shape)}
          variant={qr.shape === option.shape ? 'selected' : 'panel'}
          size="small"
          className={`${CHIP_BASE} ${qr.shape === option.shape ? CHIP_ACTIVE : CHIP_IDLE}`}
          data-testid="qr-generator__shape"
        >
          {option.label}
        </Button>
      ))}
      <Button
        type="button"
        onClick={() => qr.setShimmering(!qr.isShimmering)}
        variant={qr.isShimmering ? 'selected' : 'panel'}
        size="small"
        className={`${CHIP_BASE} ${qr.isShimmering ? CHIP_ACTIVE : CHIP_IDLE} inline-flex items-center gap-1`}
        aria-pressed={qr.isShimmering}
        data-testid="qr-generator__shimmer"
      >
        <Sparkles className="w-3 h-3" />
        Shimmer
      </Button>
    </div>
  </div>
);

const ExportRow: React.FC<{ qr: Generator }> = ({ qr }) => (
  <div className="flex flex-wrap items-center gap-2 pt-1">
    <Button
      type="button"
      onClick={qr.downloadSvg}
      disabled={!qr.plan}
      variant="selected"
      size="compact"
      className={`${ACTION} bg-[#d4af37]/20 border-[#f8e29b]/70 hover:bg-[#d4af37]/35 text-[#fff6dc]`}
      data-testid="qr-generator__download-svg"
    >
      <Download className="w-3.5 h-3.5 text-[#f8e29b]" />
      Download SVG
    </Button>
    <Button
      type="button"
      onClick={() => void qr.downloadPng()}
      disabled={!qr.plan || qr.isExporting}
      variant="panel"
      size="compact"
      className={`${ACTION} bg-[#0a080f]/80 hover:bg-[#191322] border-[#d4af37]/40 hover:border-[#f8e29b] text-[#f5e7c6]`}
      data-testid="qr-generator__download-png"
    >
      <ImageIcon className="w-3.5 h-3.5 text-[#f8e29b]" />
      {qr.isExporting ? 'Engraving…' : 'Download PNG'}
    </Button>
    {qr.exportError && (
      <p role="alert" className="text-xs italic text-[#e0cfa9]/80" data-testid="qr-generator__export-error">
        {qr.exportError}
      </p>
    )}
  </div>
);

const ControlsPane: React.FC<{ qr: Generator }> = ({ qr }) => (
  <div className="flex flex-col gap-4">
    <PresetRow qr={qr} />
    <label>
      <span className={LABEL}>Inscription (link, text, Wi-Fi, telephone)</span>
      <textarea
        value={qr.text}
        onChange={(e) => qr.setText(e.target.value)}
        rows={3}
        maxLength={MAX_QR_TEXT_LENGTH}
        spellCheck={false}
        autoFocus
        className={`${FIELD} resize-none deco-scroll`}
        placeholder="https://"
        data-testid="qr-generator__input"
      />
    </label>
    <label>
      <span className={LABEL}>Caption beneath the plaque</span>
      <input
        value={qr.caption}
        onChange={(e) => qr.setCaption(e.target.value)}
        maxLength={MAX_QR_CAPTION_LENGTH}
        className={`${FIELD} font-deco tracking-[0.14em] uppercase`}
        placeholder="ADMIT ONE"
        data-testid="qr-generator__caption"
      />
    </label>
    <CorrectionRow qr={qr} />
    <ShapeRow qr={qr} />
    <ExportRow qr={qr} />
  </div>
);

export const QrGeneratorModal: React.FC<QrGeneratorModalProps> = ({ open, onClose }) => {
  const qr = useQrGenerator();
  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="qr-generator-title"
      className="relative max-h-[92dvh] w-full max-w-3xl overflow-y-auto border border-[#d4af37]/50 bg-[#09070c]/95 p-6 shadow-[0_0_70px_rgba(212,175,55,0.2)] deco-scroll sm:p-7"
      backdropClassName="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
      testId="qr-generator__backdrop"
    >
        <CornerBrackets />

        <div className="flex items-start justify-between border-b border-[#d4af37]/25 pb-4 mb-5">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-[#d4af37]">
              Gilded Cipher · Scannable Art Deco Plaque
            </div>
            <h2 id="qr-generator-title" className="mt-1 text-lg sm:text-xl font-deco tracking-[0.14em] text-[#fff4d4]">
              GOLDEN QR GENERATOR
            </h2>
          </div>
          <IconButton
            type="button"
            onClick={onClose}
            label="Close QR generator"
            icon={<X className="h-4 w-4" />}
            className="border-[#d4af37]/30 p-1.5 text-[#d4af37]/80 hover:border-[#f8e29b] hover:text-[#fff4d4]"
            data-testid="qr-generator__close"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,340px)_1fr] gap-6">
          <PreviewPane qr={qr} />
          <ControlsPane qr={qr} />
        </div>
    </Dialog>
  );
};
