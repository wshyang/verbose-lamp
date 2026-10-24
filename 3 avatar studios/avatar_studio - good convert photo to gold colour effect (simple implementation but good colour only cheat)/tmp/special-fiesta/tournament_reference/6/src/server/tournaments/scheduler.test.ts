import { describe, expect, it } from 'vitest';
import type { MatchRecord, ParticipantSlot, TournamentSettings } from '../../shared/contracts.js';
import { createMatchDraft, outcomeParticipant, teamParticipant } from './drafts.js';
import { createScheduleSummary, reflowStagedMatches, scheduleDrafts, scheduleManualMatch } from './scheduler.js';

const settings: TournamentSettings = {
  teamCount: 4,
  courtCount: 2,
  matchDurationMinutes: 20,
  tournamentLengthMinutes: 180,
  startTimeMinutes: 540,
};

const team = (id: string) => ({
  id,
  tournamentId: 'tournament-test',
  name: id.toUpperCase(),
  seed: Number(id.replace('t', '')) || 1,
  withdrawnAt: null,
  withdrawalReason: null,
});

const teamRef = (id: string): ParticipantSlot => ({ kind: 'team', teamId: id, label: id.toUpperCase() });

function match(
  id: string,
  status: MatchRecord['status'],
  homeSlot: ParticipantSlot,
  awaySlot: ParticipantSlot,
  schedule: MatchRecord['schedule'],
  dependsOn: string[] = [],
  roundNumber = 1,
  position = 1,
): MatchRecord {
  return {
    id,
    tournamentId: 'tournament-test',
    code: id,
    phase: 'Round',
    roundNumber,
    groupKey: null,
    position,
    status,
    homeSlot,
    awaySlot,
    dependsOn,
    schedule,
    score: status === 'final' ? { home: 1, away: 0, winnerTeamId: 't1', finalizedAt: '2026-10-14T09:20:00.000Z' } : null,
  };
}

const schedule = (startMinute: number, endMinute: number, courtNumber: number, durationMinutes = endMinute - startMinute) => ({
  startMinute,
  endMinute,
  courtNumber,
  durationMinutes,
});

describe('court and match scheduling', () => {
  it('allocates dependencies after source matches and avoids a known team playing twice', () => {
    const drafts = [
      createMatchDraft('A', 'Round 1', 1, null, 1, teamParticipant(team('t1')), teamParticipant(team('t2'))),
      createMatchDraft('B', 'Round 1', 1, null, 2, teamParticipant(team('t3')), teamParticipant(team('t4'))),
      createMatchDraft('C', 'Final', 2, null, 3, outcomeParticipant('winner', 'A'), teamParticipant(team('t3')), ['A']),
    ];
    const results = scheduleDrafts(drafts, settings);
    expect(results.get('A')?.startMinute).toBe(540);
    expect(results.get('B')?.startMinute).toBe(540);
    expect(results.get('C')?.startMinute).toBe(560);
  });

  it('chooses the earliest slot for a desk-staged game across available courts', () => {
    const existing = [match('busy', 'staged', teamRef('t1'), teamRef('t2'), schedule(540, 560, 1))];
    const planned = scheduleManualMatch(existing, ['t3', 't4'], settings);
    expect(planned).toEqual(schedule(540, 560, 2));
  });

  it('moves a desk-staged game past a shared team and supports a court/time request', () => {
    const existing = [match('busy', 'staged', teamRef('t1'), teamRef('t2'), schedule(540, 560, 1))];
    expect(scheduleManualMatch(existing, ['t1', 't3'], settings)).toEqual(schedule(560, 580, 1));
    expect(scheduleManualMatch([], ['t1', 't2'], settings, 600, 2)).toEqual(schedule(600, 620, 2));
  });

  it('checks direct teams but does not mistake outcome placeholders for a known team', () => {
    const linked = match(
      'linked',
      'staged',
      { kind: 'winner', matchId: 'source', matchCode: 'source', label: 'Winner of source' },
      teamRef('t2'),
      schedule(540, 560, 1),
    );
    expect(scheduleManualMatch([linked], ['t1', 't3'], settings)).toEqual(schedule(540, 560, 2));
  });

  it('rejects an invalid requested court, an overlapping request, and no free court', () => {
    const busy = [match('busy', 'staged', teamRef('t1'), teamRef('t2'), schedule(540, 560, 1))];
    expect(() => scheduleManualMatch([], ['t1', 't2'], settings, undefined, 3)).toThrow('Choose a court that is currently available.');
    expect(() => scheduleManualMatch(busy, ['t1', 't3'], settings, 540, 1)).toThrow('That time overlaps another match for this team or court.');
    expect(() => scheduleManualMatch([], ['t1', 't2'], { ...settings, courtCount: 0 })).toThrow('No available court can take this match.');
    expect(() => scheduleManualMatch([], ['t1', 't2'], settings, 500)).toThrow('Match time must be at or after the tournament start.');
  });

  it('reflows only staged matches, preserves live/final records, and ignores closed courts for new games', () => {
    const final = match('final', 'final', teamRef('t1'), teamRef('t2'), schedule(540, 560, 1));
    const live = match('live', 'live', teamRef('t3'), teamRef('t4'), schedule(540, 580, 2));
    const staged = match('staged', 'staged', teamRef('t1'), teamRef('t5'), schedule(560, 580, 1), [], 2, 3);
    const second = match('second', 'staged', teamRef('t3'), teamRef('t5'), schedule(580, 600, 1), ['live'], 3, 4);
    const cancelled = match('cancelled', 'cancelled', teamRef('t6'), teamRef('t7'), schedule(580, 600, 2));
    const result = reflowStagedMatches(
      [final, live, staged, second, cancelled],
      { courtCount: 1, matchDurationMinutes: 30, startTimeMinutes: 540 },
      600,
    );
    expect(result[0]?.schedule).toEqual(final.schedule);
    expect(result[1]?.schedule).toEqual(live.schedule);
    expect(result[2]?.schedule).toEqual(schedule(600, 630, 1, 30));
    expect(result[3]?.schedule).toEqual(schedule(630, 660, 1, 30));
    expect(result[4]?.schedule).toEqual(cancelled.schedule);
  });

  it('reflows missing dependency IDs from the effective time and orders same-round matches by desk position', () => {
    const first = match('first', 'staged', teamRef('t1'), teamRef('t2'), schedule(540, 560, 1), ['not-loaded'], 2, 1);
    const second = match('second', 'staged', teamRef('t3'), teamRef('t4'), schedule(540, 560, 1), [], 2, 2);
    const result = reflowStagedMatches([second, first], { courtCount: 1, matchDurationMinutes: 15, startTimeMinutes: 540 }, 600);
    expect(result.find((item) => item.id === 'first')?.schedule.startMinute).toBe(600);
    expect(result.find((item) => item.id === 'second')?.schedule.startMinute).toBe(615);
  });

  it('summarises empty, cancelled, and over-budget schedules', () => {
    expect(createScheduleSummary([], 540, 120, 2, 20)).toMatchObject({ matchCount: 0, durationMinutes: 0, fits: true });
    const cancelled = match('cancelled', 'cancelled', teamRef('t1'), teamRef('t2'), schedule(800, 820, 1));
    expect(createScheduleSummary([cancelled], 540, 30, 2, 20).matchCount).toBe(0);
    const staged = match('later', 'staged', teamRef('t1'), teamRef('t2'), schedule(540, 600, 1, 60));
    expect(createScheduleSummary([staged], 540, 30, 2, 20).fits).toBe(false);
  });

  it('handles outcome and non-outcome slots when tracking team availability', () => {
    const source = match('source', 'final', teamRef('t1'), teamRef('t2'), schedule(540, 560, 1));
    const downstream = match(
      'downstream',
      'staged',
      { kind: 'winner', matchId: 'source', matchCode: 'source', label: 'Winner source' },
      { kind: 'group-rank', groupKey: 'A', rank: 1, label: 'Group A leader' },
      schedule(560, 580, 1),
      ['source'],
      2,
    );
    const result = reflowStagedMatches([source, downstream], { courtCount: 1, matchDurationMinutes: 25, startTimeMinutes: 540 }, 540);
    expect(result[1]?.schedule.startMinute).toBe(560);
  });
});
