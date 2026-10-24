import { useCallback, useMemo } from 'react';
import type { PassportStationView } from '@psd/contracts';
import { fetchMyPassport } from '../api/participants.js';
import type { ChopSpec } from '../passport/chop.js';
import { buildChopStack } from '../passport/chopStack.js';
import { PASSPORT_CACHE, POINTS_BEARING_WARM_MS } from '../storage/cacheNames.js';
import { useLocalCachedData } from './useLocalCachedData.js';

/**
 * ADR-239 — the passport tab of Scan History: every station the day has, and a chop on each one
 * this participant has completed.
 *
 * The chop is the device's own (ADR-240): the seed is drawn the first time a completed station is
 * shown here and kept, so the impression does not change between visits. The *die* is the
 * station's (ADR-242), derived from its id, so the same station is the same shape on every phone
 * while the strike of it is not. ADR-261 — a station completed again strikes again: the hook
 * builds one spec per completion, repeat strikes seeded from the kept one. The hook is the one
 * place that asks for all this, so the component below receives finished specs and only draws.
 * ADR-262 — the stack the hook hands over is capped (see `chopStack.ts`); the row keeps the
 * true count beside it so the page can fold what it did not draw into a "+N more" pill.
 */

export interface PassportRow {
  activityId: string;
  activityName: string;
  isCompleted: boolean;
  /** How many counted scans stand behind this station, however many are drawn. */
  completions: number;
  /**
   * The impressions the row draws, first strike first, capped for the page
   * (ADR-262). Empty for an open slot: nothing to draw until the first
   * counted scan lands. `completions` may exceed their number.
   */
  chops: ChopSpec[];
}

export interface PassportState {
  stations: PassportRow[];
  /** "2 of 5 stations completed". Undefined while the day has no stations at all. */
  progress: string | undefined;
  isLoading: boolean;
  error: string | null;
  reload: () => void;
}

/** "1 of 1 station completed", "0 of 2 stations completed". */
function progressLine(completed: number, total: number): string {
  const noun = total === 1 ? 'station' : 'stations';
  return `${completed} of ${total} ${noun} completed`;
}

function rowsFor(stations: readonly PassportStationView[]): PassportRow[] {
  return stations.map((station) => {
    // A passport cached by an older build has no count; one completion is the
    // least a completed station can mean, and the next refresh replaces it.
    const completions =
      typeof station.completions === 'number'
        ? station.completions
        : station.isCompleted
          ? 1
          : 0;
    return {
      activityId: station.activityId,
      activityName: station.activityName,
      isCompleted: station.isCompleted,
      completions,
      chops: buildChopStack(station.activityId, station.activityName, completions),
    };
  });
}

export function usePassport(): PassportState {
  const state = useLocalCachedData({
    name: PASSPORT_CACHE,
    loader: useCallback(() => fetchMyPassport(), []),
    ttlMs: POINTS_BEARING_WARM_MS,
  });
  const stations = useMemo(() => rowsFor(state.data?.stations ?? []), [state.data]);
  const completed = stations.filter((station) => station.isCompleted).length;
  return {
    stations,
    progress: stations.length === 0 ? undefined : progressLine(completed, stations.length),
    isLoading: state.isLoading,
    error: state.error,
    reload: state.reload,
  };
}
