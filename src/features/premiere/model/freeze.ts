import { TOTAL_SEQUENCE_DURATION } from '../data/sequence';

/**
 * The `?freezeAt=<seconds>` likeness-gate hook (ADDENDUM-022 §0.2).
 * Returns the frozen time, or null for a plain visit. Never throws:
 * anything malformed or outside [0, TOTAL) is simply not a freeze.
 */
export function parseFreezeAt(search: string): number | null {
  const raw = new URLSearchParams(search).get('freezeAt');
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(raw.trim()) === false) return null;
  if (value < 0 || value >= TOTAL_SEQUENCE_DURATION) return null;
  return value;
}
