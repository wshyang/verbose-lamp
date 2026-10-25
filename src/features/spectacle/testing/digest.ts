import { hashText } from './recordingCanvas';

/**
 * Golden digests for planning data. Numbers are rounded before hashing because
 * `Math.sin`/`Math.cos`/`Math.hypot` are not bit-identical across JavaScript
 * engines: Node 22 and Node 24 differ in the last unit in the last place, which
 * changed the shortest decimal representation of the same value and broke six
 * shell snapshots that were recorded on Node 24 (see ADDENDUM-025 §4).
 *
 * Six decimals is two orders of magnitude coarser than any drift we care about
 * (a recipe change moves values by >0.001) and finer than any engine difference.
 */
const DIGITS = 6;

export interface GoldenDigest {
  length: number;
  hash: string;
}

/** Round-trip-stable JSON: object keys keep their order, numbers lose engine noise. */
export function normaliseNumbers(value: unknown): unknown {
  if (typeof value === 'number') return Number(value.toFixed(DIGITS));
  if (Array.isArray(value)) return value.map(normaliseNumbers);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, inner]) => [key, normaliseNumbers(inner)])
    );
  }
  return value;
}

/** `{ length, hash }` of the normalised JSON — compact enough for a snapshot. */
export function goldenDigest(value: unknown): GoldenDigest {
  const text = JSON.stringify(normaliseNumbers(value));
  return { length: text.length, hash: hashText(text) };
}
