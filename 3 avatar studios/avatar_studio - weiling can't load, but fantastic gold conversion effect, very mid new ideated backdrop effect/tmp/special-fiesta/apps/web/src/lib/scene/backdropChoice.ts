/**
 * ADR-023 — which backdrop the participant theme draws: the classic art at one pixel per
 * art unit, the fine art at two, or (ADR-200) the photoreal Sentosa scene.
 *
 * The first two are the same scene from the same drawing code, so the only way to judge
 * them is side by side in the running app. `?backdrop=fine` (or `classic`, or `real`) on
 * any participant URL switches and remembers the choice; without the parameter the
 * remembered one wins, and without either it is classic.
 *
 * ADR-201 — `real` is opt-in, and unlike the other two it is **not remembered**. Eighteen
 * megabytes of photograph is not something to leave switched on for somebody by accident:
 * the classic art is the default and stays the default the moment the parameter is gone.
 *
 * That asymmetry is deliberate rather than an oversight. `classic` and `fine` exist to be
 * compared, and a comparison you must re-request on every navigation is not a comparison,
 * so those two are written down. `real` is a thing you go and look at, and the cost of
 * forgetting you left it on is paid in megabytes by whoever opens the laptop next.
 *
 * This module owns `psd.backdrop.v1` — no one else reads or writes that key (ADR-019).
 */

import { readItem, writeItem } from '../storage/localStore.js';

export const BACKDROP_KEY = 'psd.backdrop.v1';
export const BACKDROP_PARAM = 'backdrop';

export type BackdropChoice = 'classic' | 'fine' | 'real';

/** The two that are written down. `real` is deliberately not one of them. */
type StickyChoice = 'classic' | 'fine';

function isChoice(value: string | null): value is BackdropChoice {
  return value === 'classic' || value === 'fine' || value === 'real';
}

/** Reads the requested variant out of a query string, e.g. `?backdrop=fine`. */
export function requestedBackdrop(search: string): BackdropChoice | null {
  const asked = new URLSearchParams(search).get(BACKDROP_PARAM);
  return isChoice(asked) ? asked : null;
}

/**
 * The variant to draw now. A parameter in the URL is a deliberate switch, so it is written
 * down and survives navigation; otherwise the last switch stands.
 */
function isSticky(value: string | null): value is StickyChoice {
  return value === 'classic' || value === 'fine';
}

export function resolveBackdrop(search: string): BackdropChoice {
  const asked = requestedBackdrop(search);
  const stored = readItem(BACKDROP_KEY);
  // Only a change is written, so re-rendering the scene touches storage no more than the
  // switch itself does. `real` is never written, so it lasts exactly as long as the URL.
  if (isSticky(asked) && asked !== stored) writeItem(BACKDROP_KEY, asked);
  if (asked !== null) return asked;
  return isSticky(stored) ? stored : 'classic';
}
