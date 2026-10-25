import { TOTAL_SEQUENCE_DURATION } from '../data/sequence';

const FREEZE_PARAM = 'freezeAt';

/**
 * Parses the `?freezeAt=<seconds>` test affordance (ADDENDUM-022 §0.2).
 * Returns the frozen sequence time, or null when the parameter is absent,
 * unparsable, or outside the sequence — a plain visit behaves exactly as
 * before. Playwright's likeness gate drives the premiere through this.
 */
export function parseFreezeAt(search: string): number | null {
  const raw = new URLSearchParams(search).get(FREEZE_PARAM);
  if (raw === null || raw.trim() === '') return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds >= TOTAL_SEQUENCE_DURATION) return null;
  return seconds;
}
