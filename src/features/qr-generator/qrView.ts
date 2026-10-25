import { tryEncodeQr } from './encode';
import { buildRenderPlan, resolveQrStyle } from './geometry';
import { QR_PRESETS } from './presets';
import type { QrErrorCorrection, QrModuleShape, QrRenderPlan } from './types';

export interface QrSummary {
  readonly version: number;
  readonly size: number;
  readonly byteCount: number;
}

export function findMatchingPreset(text: string, level: QrErrorCorrection): string | null {
  const match = QR_PRESETS.find((preset) => preset.text === text && preset.errorCorrection === level);
  return match ? match.id : null;
}

const byteLength = (text: string): number => new TextEncoder().encode(text).length;

export type QrEncoding = ReturnType<typeof tryEncodeQr>;

/** The summary line under the preview: code version and size, and how many bytes were encoded. */
export function summaryOf(plan: QrRenderPlan | null, text: string): QrSummary | null {
  return plan ? { version: plan.version, size: plan.size, byteCount: byteLength(text) } : null;
}

/** The drawing for an encoding, or null when the text could not be encoded. */
export function planOf(encoded: QrEncoding, shape: QrModuleShape): QrRenderPlan | null {
  return encoded.ok ? buildRenderPlan(encoded.matrix, resolveQrStyle(shape)) : null;
}
