import { TOTAL_SEQUENCE_DURATION } from '../data/sequence';

/**
 * Reads the `?freezeAt=<seconds>` test affordance (ADDENDUM-022 §4.0.2).
 *
 * The premiere normally plays from the clock; with a freeze time the scene renders
 * one fixed frame, which is what screenshot baselines compare. Anything that is not
 * a finite time inside the sequence returns null, so a plain visit is untouched.
 */
export function parseFreezeAt(search: string): number | null {
  const raw = new URLSearchParams(search).get('freezeAt');
  if (raw === null || raw.trim() === '') return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds)) return null;
  if (seconds < 0 || seconds >= TOTAL_SEQUENCE_DURATION) return null;
  return seconds;
}
