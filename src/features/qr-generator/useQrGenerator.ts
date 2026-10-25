import { useCallback, useRef, useState } from 'react';
import { useQrDownloads } from './hooks/useQrDownloads';
import { useQrEncoding } from './hooks/useQrEncoding';
import { MAX_QR_CAPTION_LENGTH, QR_PRESETS } from './presets';
import type { QrErrorCorrection, QrModuleShape, QrPreset, QrRenderPlan } from './types';
import type { QrSummary } from './model/qrView';

export type { QrSummary };

export interface QrGeneratorState {
  readonly text: string;
  readonly caption: string;
  readonly errorCorrection: QrErrorCorrection;
  readonly shape: QrModuleShape;
  readonly isShimmering: boolean;
  readonly activePresetId: string | null;
  readonly plan: QrRenderPlan | null;
  readonly summary: QrSummary | null;
  readonly error: string | null;
  readonly isExporting: boolean;
  readonly svgRef: React.RefObject<SVGSVGElement | null>;
  readonly setText: (text: string) => void;
  readonly setCaption: (caption: string) => void;
  readonly setErrorCorrection: (level: QrErrorCorrection) => void;
  readonly setShape: (shape: QrModuleShape) => void;
  readonly setShimmering: (on: boolean) => void;
  readonly applyPreset: (preset: QrPreset) => void;
  readonly downloadSvg: () => void;
  readonly downloadPng: () => Promise<void>;
}

const INITIAL_PRESET = QR_PRESETS[0];

/**
 * The QR generator's state (ADDENDUM-039): the draft, the encode chain
 * (`useQrEncoding`), and the export paths (`useQrDownloads`). Nothing here
 * computes — it holds the draft and wires the three together.
 */
export function useQrGenerator(): QrGeneratorState {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [text, setText] = useState(INITIAL_PRESET.text);
  const [caption, setCaptionRaw] = useState(INITIAL_PRESET.caption);
  const [errorCorrection, setErrorCorrection] = useState<QrErrorCorrection>(INITIAL_PRESET.errorCorrection);
  const [shape, setShape] = useState<QrModuleShape>('plaque');
  const [isShimmering, setShimmering] = useState(true);
  const [isExporting, setExporting] = useState(false);

  const { encoded, plan, summary, activePresetId } = useQrEncoding({ text, errorCorrection, shape });

  const setCaption = useCallback((next: string) => {
    setCaptionRaw(next.slice(0, MAX_QR_CAPTION_LENGTH));
  }, []);

  const applyPreset = useCallback((preset: QrPreset) => {
    setText(preset.text);
    setCaptionRaw(preset.caption);
    setErrorCorrection(preset.errorCorrection);
  }, []);

  const { downloadSvg, downloadPng } = useQrDownloads({ svgRef, caption, isExporting, setExporting });

  return {
    text,
    caption,
    errorCorrection,
    shape,
    isShimmering,
    activePresetId,
    plan,
    summary,
    error: encoded.ok ? null : encoded.reason,
    isExporting,
    svgRef,
    setText,
    setCaption,
    setErrorCorrection,
    setShape,
    setShimmering,
    applyPreset,
    downloadSvg,
    downloadPng,
  };
}
