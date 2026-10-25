import { useCallback, useMemo, useState } from 'react';
import { tryEncodeQr } from './encode';
import { MAX_QR_CAPTION_LENGTH, QR_PRESETS } from './presets';
import { findMatchingPreset, planOf, summaryOf, type QrSummary } from './qrView';
import type { QrErrorCorrection, QrModuleShape, QrPreset, QrRenderPlan } from './types';
import { useQrExport } from './useQrExport';

export type { QrSummary } from './qrView';

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
  /** Why the last PNG export failed, or null. SVG export cannot fail in a way the browser hides. */
  readonly exportError: string | null;
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

export function useQrGenerator(): QrGeneratorState {
  const [text, setText] = useState(INITIAL_PRESET.text);
  const [caption, setCaptionRaw] = useState(INITIAL_PRESET.caption);
  const [errorCorrection, setErrorCorrection] = useState<QrErrorCorrection>(INITIAL_PRESET.errorCorrection);
  const [shape, setShape] = useState<QrModuleShape>('plaque');
  const [isShimmering, setShimmering] = useState(true);
  const exporter = useQrExport(caption);

  const encoded = useMemo(() => tryEncodeQr({ text, errorCorrection }), [text, errorCorrection]);
  const plan = useMemo(() => planOf(encoded, shape), [encoded, shape]);
  const summary = useMemo(() => summaryOf(plan, text), [plan, text]);
  const activePresetId = useMemo(() => findMatchingPreset(text, errorCorrection), [text, errorCorrection]);

  const setCaption = useCallback((next: string) => {
    setCaptionRaw(next.slice(0, MAX_QR_CAPTION_LENGTH));
  }, []);

  const applyPreset = useCallback((preset: QrPreset) => {
    setText(preset.text);
    setCaptionRaw(preset.caption);
    setErrorCorrection(preset.errorCorrection);
  }, []);

  return {
    text, caption, errorCorrection, shape, isShimmering, activePresetId,
    plan, summary, error: encoded.ok ? null : encoded.reason,
    ...exporter,
    setText, setCaption, setErrorCorrection, setShape, setShimmering, applyPreset,
  };
}
