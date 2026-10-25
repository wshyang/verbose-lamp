import type { QrErrorCorrection, QrRenderPlan } from '../types';
import { QR_PRESETS } from '../presets';

/**
 * The derived readouts of the QR generator (ADDENDUM-039), kept out of the hook
 * so each rule is a small function a test can call directly.
 */

/** The preset whose text and correction level the current draft matches, if any. */
export function findMatchingPreset(text: string, level: QrErrorCorrection): string | null {
  const match = QR_PRESETS.find((preset) => preset.text === text && preset.errorCorrection === level);
  return match ? match.id : null;
}

/** UTF-8 byte length: the number the QR capacity check actually cares about. */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export interface QrSummary {
  readonly version: number;
  readonly size: number;
  readonly byteCount: number;
}

/** The legend under the code: version, module count and payload size. */
export function summaryOf(plan: QrRenderPlan | null, text: string): QrSummary | null {
  return plan ? { version: plan.version, size: plan.size, byteCount: byteLength(text) } : null;
}
