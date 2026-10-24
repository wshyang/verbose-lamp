import { useCallback, useMemo, useRef, useState } from 'react';
import { tryEncodeQr } from './encode';
import { downloadSvgAsPng, downloadSvgElement, toSafeFileStem } from './export';
import { buildRenderPlan, resolveQrStyle } from './geometry';
import { MAX_QR_CAPTION_LENGTH, QR_PRESETS } from './presets';
import type { QrErrorCorrection, QrModuleShape, QrPreset, QrRenderPlan } from './types';

export interface QrSummary {
  readonly version: number;
  readonly size: number;
  readonly byteCount: number;
}

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

function findMatchingPreset(text: string, level: QrErrorCorrection): string | null {
  const match = QR_PRESETS.find((p) => p.text === text && p.errorCorrection === level);
  return match ? match.id : null;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function useQrGenerator(): QrGeneratorState {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [text, setText] = useState(INITIAL_PRESET.text);
  const [caption, setCaptionRaw] = useState(INITIAL_PRESET.caption);
  const [errorCorrection, setErrorCorrection] = useState<QrErrorCorrection>(
    INITIAL_PRESET.errorCorrection
  );
  const [shape, setShape] = useState<QrModuleShape>('plaque');
  const [isShimmering, setShimmering] = useState(true);
  const [isExporting, setExporting] = useState(false);

  const encoded = useMemo(() => tryEncodeQr({ text, errorCorrection }), [text, errorCorrection]);
  const plan = useMemo(
    () => (encoded.ok ? buildRenderPlan(encoded.matrix, resolveQrStyle(shape)) : null),
    [encoded, shape]
  );
  const summary = useMemo<QrSummary | null>(
    () => (plan ? { version: plan.version, size: plan.size, byteCount: byteLength(text) } : null),
    [plan, text]
  );
  const activePresetId = useMemo(
    () => findMatchingPreset(text, errorCorrection),
    [text, errorCorrection]
  );

  const setCaption = useCallback((next: string) => {
    setCaptionRaw(next.slice(0, MAX_QR_CAPTION_LENGTH));
  }, []);

  const applyPreset = useCallback((preset: QrPreset) => {
    setText(preset.text);
    setCaptionRaw(preset.caption);
    setErrorCorrection(preset.errorCorrection);
  }, []);

  const downloadSvg = useCallback(() => {
    if (!svgRef.current) return;
    downloadSvgElement(svgRef.current, toSafeFileStem(caption));
  }, [caption]);

  const downloadPng = useCallback(async () => {
    if (!svgRef.current || isExporting) return;
    setExporting(true);
    try {
      await downloadSvgAsPng(svgRef.current, toSafeFileStem(caption));
    } finally {
      setExporting(false);
    }
  }, [caption, isExporting]);

  return {
    text, caption, errorCorrection, shape, isShimmering, activePresetId,
    plan, summary, error: encoded.ok ? null : encoded.reason, isExporting, svgRef,
    setText, setCaption, setErrorCorrection, setShape, setShimmering,
    applyPreset, downloadSvg, downloadPng,
  };
}
