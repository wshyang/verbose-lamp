import { TOTAL_SEQUENCE_DURATION } from '../data/sequence';

/**
 * `?freezeAt=<seconds>` pins the premiere to one frame for screenshot tests
 * (ADDENDUM-027 §3). It is a test affordance: a plain visit behaves exactly as
 * before, and the manager ignores the pointer while frozen.
 */
export const FREEZE_PARAM = 'freezeAt';

export function parseFreezeAt(search: string): number | null {
  const normalized = search.startsWith('?') ? search.slice(1) : search;
  const raw = new URLSearchParams(normalized).get(FREEZE_PARAM);
  if (raw === null || raw.trim() === '') return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds)) return null;
  if (seconds < 0 || seconds >= TOTAL_SEQUENCE_DURATION) return null;
  return seconds;
}
