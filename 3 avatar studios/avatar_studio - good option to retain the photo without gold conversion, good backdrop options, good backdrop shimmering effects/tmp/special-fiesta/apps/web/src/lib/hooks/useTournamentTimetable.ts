import { useCallback, useMemo } from 'react';
import type { AdminMatchView, TimetableView } from '@psd/contracts';
import { fetchTimetable } from '../api/tournament.js';
import { useAsyncData, usePolling } from './useAsyncData.js';

/**
 * ADR-279 — the Timetable subtab: one lane per court across the day, with a now-line. The read is the
 * API's; this hook only turns instants into positions on a shared axis, so the component draws.
 */

/** A lane block, positioned as a fraction of the axis (0 = the axis start, 1 = its end). */
export interface LaneBlock {
  match: AdminMatchView;
  left: number;
  width: number;
}

export interface TimetableAxis {
  startMs: number;
  endMs: number;
  /** Where "now" falls on the axis, as a fraction. */
  now: number;
  /** Whole-hour marks across the axis, as fractions with their clock labels. */
  marks: { at: number; label: string }[];
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** The axis pads the day by a quarter hour each side, so the first and last blocks are not on the edge. */
const PAD_MS = 15 * MINUTE;
/** The narrowest a block is drawn, as a fraction, so a very short match is still something to see. */
const MIN_WIDTH = 0.005;

function startOf(match: AdminMatchView): number | null {
  const at = match.startedAt ?? match.plannedStartAt;
  return at === null ? null : new Date(at).getTime();
}

function endOf(match: AdminMatchView, startMs: number): number {
  return match.endedAt === null ? startMs + match.plannedMinutes * MINUTE : new Date(match.endedAt).getTime();
}

function hourLabel(ms: number): string {
  return `${String(new Date(ms).getHours()).padStart(2, '0')}:00`;
}

/** The axis covering every placed match and now, padded, with a mark on each whole hour. */
export function axisOf(view: TimetableView): TimetableAxis {
  const nowMs = new Date(view.now).getTime();
  const spans = view.lanes.flatMap((lane) =>
    lane.matches.flatMap((match) => {
      const start = startOf(match);
      return start === null ? [] : [start, endOf(match, start)];
    }),
  );
  const startMs = Math.min(nowMs, ...spans) - PAD_MS;
  const endMs = Math.max(nowMs, ...spans) + PAD_MS;
  const span = endMs - startMs;
  const marks: TimetableAxis['marks'] = [];
  for (let at = Math.ceil(startMs / HOUR) * HOUR; at <= endMs; at += HOUR) marks.push({ at: (at - startMs) / span, label: hourLabel(at) });
  return { startMs, endMs, now: (nowMs - startMs) / span, marks };
}

/** One lane's matches as positioned blocks; a match with no time yet is left off the lane. */
export function blocksOf(matches: readonly AdminMatchView[], axis: TimetableAxis): LaneBlock[] {
  const span = axis.endMs - axis.startMs;
  return matches.flatMap((match) => {
    const start = startOf(match);
    if (start === null) return [];
    const width = Math.max(MIN_WIDTH, (endOf(match, start) - start) / span);
    return [{ match, left: (start - axis.startMs) / span, width }];
  });
}

export function useTournamentTimetable() {
  const state = useAsyncData(useCallback(() => fetchTimetable(), []));
  usePolling(state.reload);
  const view = state.data;
  const axis = useMemo(() => (view === null ? null : axisOf(view)), [view]);
  const lanes = useMemo(() => {
    if (view === null || axis === null) return [];
    return view.lanes.map((lane) => ({ court: lane.court, blocks: blocksOf(lane.matches, axis) }));
  }, [view, axis]);
  return {
    axis,
    lanes,
    unplaced: view?.unplaced ?? [],
    fit: view?.fit ?? null,
    isLoading: state.isLoading,
    error: state.error,
    reload: state.reload,
  };
}
