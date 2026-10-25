import { TOTAL_SEQUENCE_DURATION } from '../data/sequence';

/**
 * Test affordance (ADDENDUM-022 §0.2): `?freezeAt=<seconds>` pins the sequence to one
 * frame so a screenshot is reproducible. Users never see it; a plain visit behaves
 * exactly as before.
 */
export const FREEZE_PARAM = 'freezeAt';

// Plain decimal only. `Number()` also reads `0x10`, `0b11` and the like, which would
// freeze the premiere at a time nobody typed.
const PLAIN_DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** Seconds to freeze at, or `null` when the URL asks for nothing usable. Never throws. */
export function parseFreezeAt(search: string): number | null {
  const raw = new URLSearchParams(search).get(FREEZE_PARAM)?.trim();
  if (!raw || !PLAIN_DECIMAL.test(raw)) return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds)) return null;
  if (seconds < 0 || seconds >= TOTAL_SEQUENCE_DURATION) return null;
  return seconds + 0; // `-0 + 0` is `+0`: a frozen time never carries a negative zero
}
