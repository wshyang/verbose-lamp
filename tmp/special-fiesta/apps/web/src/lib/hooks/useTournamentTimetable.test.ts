import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { TimetableView } from '@psd/contracts';
import { installFetchStub, type FetchStub } from '../../test-utils/fetchStub.js';
import { adminMatch, consoleView } from '../../test-utils/tournamentFixtures.js';
import { axisOf, blocksOf, useTournamentTimetable } from './useTournamentTimetable.js';
import { clockOf, INITIAL_KNOBS, runSimulation, useTournamentSimulator } from './useTournamentSimulator.js';

/**
 * ADR-279 — the Timetable's geometry (instants onto one axis, a now-line, hour marks) and the
 * Simulator (the engine's own `simulate`, seeded from the room as it stands).
 */

let stub: FetchStub;
afterEach(() => stub?.restore());

const court = { id: 'c1', courtNumber: 1, label: 'Court 1', isEnabled: true };

function timetable(overrides: Partial<TimetableView> = {}): TimetableView {
  return {
    now: '2026-10-15T02:00:00.000Z',
    lanes: [
      {
        court,
        matches: [
          adminMatch({ id: 'done', status: 'completed', startedAt: '2026-10-15T01:00:00.000Z', endedAt: '2026-10-15T01:10:00.000Z' }),
          adminMatch({ id: 'next', plannedStartAt: '2026-10-15T03:00:00.000Z', plannedMinutes: 30 }),
          adminMatch({ id: 'nowhere', plannedStartAt: null }),
        ],
      },
    ],
    unplaced: [adminMatch({ id: 'nowhere', plannedStartAt: null, courtId: null })],
    fit: null,
    ...overrides,
  };
}

describe('the timetable axis', () => {
  it('spans every placed match and now, padded, with whole-hour marks and a now-line', () => {
    const axis = axisOf(timetable());
    expect(axis.startMs).toBe(Date.parse('2026-10-15T01:00:00.000Z') - 15 * 60_000);
    expect(axis.endMs).toBe(Date.parse('2026-10-15T03:30:00.000Z') + 15 * 60_000);
    expect(axis.now).toBeGreaterThan(0);
    expect(axis.now).toBeLessThan(1);
    expect(axis.marks).toHaveLength(3);
    expect(axis.marks.every((mark) => mark.label.endsWith(':00'))).toBe(true);
  });

  it('places each timed match as a block, a finished one by its real end, and drops the untimed', () => {
    const view = timetable();
    const axis = axisOf(view);
    const blocks = blocksOf(view.lanes[0]?.matches ?? [], axis);
    expect(blocks.map((block) => block.match.id)).toEqual(['done', 'next']);
    const span = axis.endMs - axis.startMs;
    expect(blocks[1]?.width).toBeCloseTo((30 * 60_000) / span);
    expect(blocks[0]?.width).toBeCloseTo((10 * 60_000) / span);
    expect((blocks[1]?.left ?? 0) > (blocks[0]?.left ?? 1)).toBe(true);
  });

  it('draws an empty venue as the half hour around now', () => {
    const axis = axisOf(timetable({ lanes: [{ court, matches: [] }] }));
    expect(axis.endMs - axis.startMs).toBe(30 * 60_000);
    expect(axis.now).toBeCloseTo(0.5);
  });

  it('loads, positions the lanes and passes the unplaced through', async () => {
    stub = installFetchStub({ 'GET /api/admin/tournament/timetable': { body: timetable() } });
    const { result } = renderHook(() => useTournamentTimetable());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.lanes[0]?.blocks).toHaveLength(2);
    expect(result.current.unplaced.map((row) => row.id)).toEqual(['nowhere']);
    expect(result.current.axis).not.toBeNull();
  });
});

describe('the simulator', () => {
  it('runs the engine’s own simulation, and says when the field cannot be played', () => {
    const plan = runSimulation({ ...INITIAL_KNOBS, formatId: 'round_robin', teamCount: '4', courtCount: '2' });
    expect(plan.error).toBeNull();
    expect(plan.matches).toHaveLength(6);
    expect(plan.matches.every((row) => row.start !== null && row.courtIndex !== null)).toBe(true);
    expect(runSimulation({ ...INITIAL_KNOBS, formatId: 'consolation', teamCount: '6' }).error).toMatch(/exactly eight/);
    const swiss = runSimulation({ ...INITIAL_KNOBS, formatId: 'swiss', teamCount: '8', rounds: '3', startAt: 'soon', deadline: '11:00' });
    expect(swiss.error).toBeNull();
    expect(swiss.fit?.fitsDeadline).not.toBeNull();
  });

  it('reads minutes after midnight as a clock, and nothing as a dash', () => {
    expect(clockOf(600)).toBe('10:00');
    expect(clockOf(1445)).toBe('00:05');
    expect(clockOf(null)).toBe('—');
  });

  it('starts from the teams registered and the courts switched on, once, and re-plans on every knob', async () => {
    const room = { ...consoleView(null), courts: [court, { ...court, id: 'c2', courtNumber: 2, isEnabled: false }] };
    stub = installFetchStub({ 'GET /api/admin/tournament': { body: room } });
    const { result } = renderHook(() => useTournamentSimulator());
    await waitFor(() => expect(result.current.registeredTeams).toBe(2));
    expect(result.current.knobs).toMatchObject({ teamCount: '2', courtCount: '1' });
    expect(result.current.enabledCourts).toBe(1);
    act(() => result.current.update({ formatId: 'round_robin', teamCount: '5' }));
    expect(result.current.result.matches).toHaveLength(10);
    expect(result.current.knobs.teamCount).toBe('5');
    expect(result.current.formats).toHaveLength(10);
  });
});
