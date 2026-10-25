import { useMemo } from 'react';
import { tryEncodeQr } from '../encode';
import { buildRenderPlan, resolveQrStyle } from '../geometry';
import { findMatchingPreset, summaryOf } from '../model/qrView';
import type { QrErrorCorrection, QrModuleShape } from '../types';

interface QrEncodingInput {
  text: string;
  errorCorrection: QrErrorCorrection;
  shape: QrModuleShape;
}

/**
 * The encode → plan → summary chain, memoised at each step (ADDENDUM-039). Only
 * the step whose input changed recomputes: retyping the caption never re-encodes.
 */
export function useQrEncoding({ text, errorCorrection, shape }: QrEncodingInput) {
  const encoded = useMemo(() => tryEncodeQr({ text, errorCorrection }), [text, errorCorrection]);
  const plan = useMemo(
    () => (encoded.ok ? buildRenderPlan(encoded.matrix, resolveQrStyle(shape)) : null),
    [encoded, shape]
  );
  const summary = useMemo(() => summaryOf(plan, text), [plan, text]);
  const activePresetId = useMemo(() => findMatchingPreset(text, errorCorrection), [text, errorCorrection]);

  return { encoded, plan, summary, activePresetId };
}
