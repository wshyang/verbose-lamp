import { useEffect, useState } from 'react';

/**
 * ADR-144 — when may a projected wall admit that it has stopped knowing anything?
 *
 * The failure this exists for is not a dropped socket. The live stream going quiet costs the
 * hall screen nothing it can see, because every scene is also polled (ADR-131/132) — saying
 * "not updating" then would be a lie printed three metres wide. The failure that matters is
 * the opposite one: every read failing while `useLocalCachedData` keeps serving its last good
 * answer, exactly as it should on a phone in a lift. On a phone that is a kindness. On a wall
 * it is a scoreboard showing an hour-old score with total confidence, in front of the people
 * who played the matches that are missing from it.
 *
 * So the mark is driven by reads failing, and only after they have failed for long enough
 * that a poll has had time to come good. Beach Wi-Fi drops a request constantly; a wall that
 * announced each one would be crying wolf by ten past nine, and a warning the room has
 * learned to ignore is worse than no warning at all.
 */

/**
 * Two poll cycles plus a margin. Short enough that an organiser notices within a scene or
 * two; long enough that one lost request, or the gap while a laptop changes access point,
 * passes unremarked.
 */
export const STALE_AFTER_MS = 90_000;

/**
 * True once `isFailing` has been continuously true for `STALE_AFTER_MS`. One successful read
 * clears it immediately and resets the clock: recovery is news the wall should tell the room
 * at once, where trouble is news it should sit on for a minute and a half first.
 */
export function useScreenHealth(reads: { isFailing: boolean }): boolean {
  const { isFailing } = reads;
  const [isStale, setIsStale] = useState(false);

  /*
   * The effect depends on `isFailing` alone, which is what makes the countdown survive the
   * re-render every scene change causes. Were the timer armed per render, a screen that
   * re-renders every twelve seconds would never reach the end of a ninety-second wait.
   */
  useEffect(() => {
    if (!isFailing) {
      setIsStale(false);
      return;
    }
    const handle = setTimeout(() => setIsStale(true), STALE_AFTER_MS);
    return () => clearTimeout(handle);
  }, [isFailing]);

  return isStale;
}
