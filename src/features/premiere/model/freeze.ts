import { TOTAL_SEQUENCE_DURATION } from '../data/sequence';

/**
 * Test affordance (ADDENDUM-022 §0.2): `?freezeAt=<seconds>` pins the sequence to
 * one frame so a screenshot is reproducible. Users never see it; a plain visit
 * behaves exactly as before.
 */
export const FREEZE_PARAM = 'freezeAt';

/** Seconds to freeze at, or `null` when the URL asks for nothing usable. */
export function parseFreezeAt(search: string): number | null {
  const raw = new URLSearchParams(search).get(FREEZE_PARAM);
  if (raw === null || raw.trim() === '') return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds)) return null;
  if (seconds < 0 || seconds >= TOTAL_SEQUENCE_DURATION) return null;
  return seconds;
}
