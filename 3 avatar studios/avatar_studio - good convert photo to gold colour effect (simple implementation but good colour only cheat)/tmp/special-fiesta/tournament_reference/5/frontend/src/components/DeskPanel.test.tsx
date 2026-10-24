// @vitest-environment jsdom
import { fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DeskPanel from './DeskPanel.js';
import { useSimulation } from '../lib/hooks/useSimulation.js';
import type { DeskState } from '../lib/hooks/useDesk.js';
import type { TournamentGraph } from '../../../shared/types.js';
import { computeStandings } from '../../../shared/standings.js';

function fixtureGraph(): TournamentGraph {
  const teams = [
    { id: 'a', name: 'Alpha', seed: 1 },
    { id: 'b', name: 'Bravo', seed: 2 },
  ];
  const matches: TournamentGraph['matches'] = [{
    id: 'm1', key: 'M1', phase: 'Round 1', groupKey: null, round: 1,
    slotA: { kind: 'team', teamRef: 'a', label: 'Alpha' },
    slotB: { kind: 'team', teamRef: 'b', label: 'Bravo' },
    dependsOn: [], courtId: 'c1', courtName: 'Court 1', startMinutes: 540, endMinutes: 560,
    status: 'scheduled', scoreA: null, scoreB: null, origin: 'generated',
  }, {
    id: 'm2', key: 'M2', phase: 'Round 1', groupKey: null, round: 1,
    slotA: { kind: 'team', teamRef: 'b', label: 'Bravo' },
    slotB: { kind: 'team', teamRef: 'a', label: 'Alpha' },
    dependsOn: [], courtId: null, courtName: null, startMinutes: null, endMinutes: null,
    status: 'final', scoreA: 8, scoreB: 3, origin: 'manual',
  }];
  const pointsEntries: TournamentGraph['pointsEntries'] = [
    { id: 'p1', teamId: 'b', matchId: 'm2', points: 3, reason: 'Match M2: win', status: 'active', voidReason: null },
    { id: 'p2', teamId: 'a', matchId: 'm2', points: 0, reason: 'Match M2: loss', status: 'voided', voidReason: 'Wrong match' },
    { id: 'p3', teamId: 'ghost', matchId: null, points: 1, reason: 'Legacy entry', status: 'voided', voidReason: null },
  ];
  return {
    tournament: {
      id: 't1', name: 'Desk Cup', mode: 'round-robin', status: 'live',
      config: {
        courts: 2, matchLengthMinutes: 20, tournamentLengthMinutes: 480,
        startMinutes: 540, restMinutes: 5, winPoints: 3, drawPoints: 1, lossPoints: 0,
      },
    },
    teams,
    courts: [{ id: 'c1', name: 'Court 1' }],
    matches,
    pointsEntries,
    standings: computeStandings(teams, matches, pointsEntries),
  };
}

function deskStub(graph: TournamentGraph | null): DeskState {
  return {
    graph,
    tournaments: graph === null ? [] : [graph.tournament],
    error: null,
    isLoading: false,
    selectTournament: vi.fn(async () => undefined),
    refreshTournaments: vi.fn(async () => undefined),
    createTournament: vi.fn(async () => undefined),
    stageManualMatch: vi.fn(async () => undefined),
    startMatch: vi.fn(async () => undefined),
    scoreMatch: vi.fn(async () => undefined),
    finaliseMatch: vi.fn(async () => undefined),
    cancelMatch: vi.fn(async () => undefined),
    assignPoints: vi.fn(async () => undefined),
    voidPoints: vi.fn(async () => undefined),
    applyContingency: vi.fn(async () => undefined),
    closeTournament: vi.fn(async () => undefined),
  };
}

function renderDesk(desk: DeskState) {
  const simulation = renderHook(() => useSimulation());
  return render(<DeskPanel desk={desk} simulation={simulation.result.current} />);
}

describe('DeskPanel without a tournament', () => {
  it('creates a live tournament from the current simulation', () => {
    const desk = deskStub(null);
    renderDesk(desk);
    expect(screen.getByTestId('desk__no-tournament')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('desk__name-input'), { target: { value: 'Saturday Cup' } });
    fireEvent.click(screen.getByTestId('desk__create-button'));
    expect(desk.createTournament).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Saturday Cup', mode: 'round-robin',
    }));
    const call = vi.mocked(desk.createTournament).mock.calls[0][0];
    expect(call.teamNames).toHaveLength(8);
  });
});

describe('DeskPanel with a live tournament', () => {
  it('drives match actions, staging, points, contingency and closing', () => {
    const graph = fixtureGraph();
    const desk = deskStub(graph);
    renderDesk(desk);
    fireEvent.change(screen.getByTestId('desk__tournament-select'), { target: { value: 't1' } });
    expect(desk.selectTournament).toHaveBeenCalledWith('t1');

    const rows = screen.getAllByTestId('desk__match-row');
    expect(rows).toHaveLength(2);
    fireEvent.click(within(rows[0]).getByTestId('desk__start-button'));
    expect(desk.startMatch).toHaveBeenCalledWith('m1');
    fireEvent.change(within(rows[0]).getByTestId('desk__score-a-input'), { target: { value: '12' } });
    fireEvent.change(within(rows[0]).getByTestId('desk__score-b-input'), { target: { value: '9' } });
    fireEvent.click(within(rows[0]).getByTestId('desk__save-score-button'));
    expect(desk.scoreMatch).toHaveBeenCalledWith('m1', 12, 9);
    fireEvent.click(within(rows[0]).getByTestId('desk__finalise-button'));
    expect(desk.finaliseMatch).toHaveBeenCalledWith('m1');
    fireEvent.click(within(rows[0]).getByTestId('desk__cancel-button'));
    expect(desk.cancelMatch).toHaveBeenCalledWith('m1');

    fireEvent.change(screen.getByTestId('desk__manual-a-select'), { target: { value: 'a' } });
    fireEvent.change(screen.getByTestId('desk__manual-b-select'), { target: { value: 'b' } });
    fireEvent.change(screen.getByTestId('desk__manual-court-select'), { target: { value: 'c1' } });
    fireEvent.click(screen.getByTestId('desk__stage-manual-button'));
    expect(desk.stageManualMatch).toHaveBeenCalledWith({ teamAId: 'a', teamBId: 'b', courtId: 'c1' });

    fireEvent.change(screen.getByTestId('desk__points-team-select'), { target: { value: 'a' } });
    fireEvent.change(screen.getByTestId('desk__points-value-input'), { target: { value: '2' } });
    fireEvent.change(screen.getByTestId('desk__points-reason-input'), { target: { value: 'Bonus' } });
    fireEvent.click(screen.getByTestId('desk__assign-points-button'));
    expect(desk.assignPoints).toHaveBeenCalledWith('a', 2, 'Bonus');

    const ledgerRows = screen.getAllByTestId('ledger__row');
    expect(within(ledgerRows[2]).getByText('ghost')).toBeInTheDocument();
    expect(within(ledgerRows[1]).getByText(/Voided: Wrong match/)).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('ledger__void-reason-input'), { target: { value: 'Fat fingers' } });
    fireEvent.click(within(ledgerRows[0]).getByTestId('ledger__void-button'));
    expect(desk.voidPoints).toHaveBeenCalledWith('p1', 'Fat fingers');

    fireEvent.change(screen.getByTestId('desk__rain-courts-input'), { target: { value: '3' } });
    fireEvent.change(screen.getByTestId('desk__rain-length-input'), { target: { value: '15' } });
    fireEvent.click(screen.getByTestId('desk__contingency-button'));
    expect(desk.applyContingency).toHaveBeenCalledWith(3, 15);

    fireEvent.click(screen.getByTestId('desk__close-button'));
    expect(desk.closeTournament).toHaveBeenCalled();
    expect(screen.getAllByTestId('standings__row')).toHaveLength(2);
  });

  it('stages a manual match without a court and shows errors and loading', () => {
    const graph = fixtureGraph();
    const desk = { ...deskStub(graph), error: 'Court does not belong', isLoading: true };
    renderDesk(desk);
    expect(screen.getByTestId('desk__error')).toHaveTextContent('Court does not belong');
    expect(screen.getByTestId('desk__loading')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('desk__manual-a-select'), { target: { value: 'a' } });
    fireEvent.change(screen.getByTestId('desk__manual-b-select'), { target: { value: 'b' } });
    fireEvent.click(screen.getByTestId('desk__stage-manual-button'));
    expect(desk.stageManualMatch).toHaveBeenCalledWith({ teamAId: 'a', teamBId: 'b', courtId: undefined });
  });

  it('shows the empty ledger state', () => {
    const graph = { ...fixtureGraph(), pointsEntries: [] };
    renderDesk(deskStub(graph));
    expect(screen.getByTestId('ledger__empty')).toBeInTheDocument();
  });
});
