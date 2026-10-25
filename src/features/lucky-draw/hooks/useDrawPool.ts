import { useCallback, useMemo, useState } from 'react';
import { SAMPLE_GUESTS } from '../data/sampleGuests';
import { validateEntries, withoutWinners, type LuckyDrawEntry } from '../model/entries';

const DEFAULT_GUEST_COUNT = 300;

/** The validated guest list, the winners already drawn, and the pool still in the drum. */
export function useDrawPool() {
  const [guestCount, setGuestCountState] = useState(DEFAULT_GUEST_COUNT);
  const [excluded, setExcluded] = useState<readonly string[]>([]);

  const all = useMemo(() => {
    const result = validateEntries(SAMPLE_GUESTS.slice(0, guestCount));
    return result.ok ? result.entries : [];
  }, [guestCount]);
  const pool = useMemo(() => withoutWinners(all, excluded), [all, excluded]);

  const exclude = useCallback((winner: LuckyDrawEntry): readonly LuckyDrawEntry[] => {
    const next = [...excluded, winner.id];
    setExcluded(next);
    return withoutWinners(all, next);
  }, [all, excluded]);
  const clearExclusions = useCallback(() => setExcluded([]), []);

  return {
    pool, guestCount, drawnCount: excluded.length, exclude, clearExclusions,
    setGuestCount: setGuestCountState,
  };
}
