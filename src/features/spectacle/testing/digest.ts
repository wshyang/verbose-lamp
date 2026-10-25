import { hashText } from './recordingCanvas';

/**
 * Golden digests compare *shape and magnitude*, not the last bit of a float.
 * `Math.sin`/`Math.cos`/`Math.pow` are implementation-defined in JS: V8 on macOS
 * and V8 on Linux disagree in the final ulp, which used to fail snapshots that
 * were captured on the author's machine (ADDENDUM-025). Quantising to
 * `DIGEST_DECIMALS` keeps the golden honest — any behavioural change moves a
 * value by far more than 1e-6 — while staying portable across hosts.
 */
export const DIGEST_DECIMALS = 6;

const SCALE = 10 ** DIGEST_DECIMALS;

/** Rounds a number to a fixed number of decimals, and never yields `-0`. */
export function quantize(value: number): number {
  if (!Number.isFinite(value)) return value;
  const rounded = Math.round(value * SCALE) / SCALE;
  return rounded === 0 ? 0 : rounded;
}

/** Rebuilds a value with every number quantised, so `JSON.stringify` is stable. */
export function quantizeDeep(value: unknown): unknown {
  if (typeof value === 'number') return quantize(value);
  if (Array.isArray(value)) return value.map(quantizeDeep);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) out[key] = quantizeDeep(entry);
    return out;
  }
  return value;
}

export interface Digest {
  length: number;
  hash: string;
}

/** Compact fingerprint of a planned value: its serialised size and SHA-1. */
export function stableDigest(value: unknown): Digest {
  const text = JSON.stringify(quantizeDeep(value));
  return { length: text.length, hash: hashText(text) };
}
