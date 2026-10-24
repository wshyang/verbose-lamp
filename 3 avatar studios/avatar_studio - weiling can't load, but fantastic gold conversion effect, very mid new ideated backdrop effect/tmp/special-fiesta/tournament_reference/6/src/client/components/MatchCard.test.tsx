// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MatchView, ParticipantSlot } from '../../shared/contracts.js';
import { matchView, team } from '../../test/fixtures.js';
import { MatchCard } from './MatchCard.js';

afterEach(cleanup);

const home = team('team-1', 'Northside', 1);
const away = team('team-2', 'River Club', 2);
const base = matchView();
const source = matchView({ id: 'source', code: 'QF-1' });

function viewWithSlots(homeSlot: ParticipantSlot, awaySlot: ParticipantSlot, overrides: Partial<MatchView> = {}): MatchView {
  return matchView({
    participants: [
      { reference: homeSlot, displayName: homeSlot.label, resolvedTeamId: homeSlot.kind === 'team' ? homeSlot.teamId : null },
      { reference: awaySlot, displayName: awaySlot.label, resolvedTeamId: awaySlot.kind === 'team' ? awaySlot.teamId : null },
    ],
    ...overrides,
  });
}

describe('MatchCard progression and control', () => {
  it('renders direct, winner, loser, group, group-winner, and Swiss participant references', () => {
    const refs: Array<[ParticipantSlot, string, string | null]> = [
      [{ kind: 'team', teamId: home.id, label: home.name }, 'Northside', null],
      [{ kind: 'winner', matchId: 'source', matchCode: 'OLD', label: 'Winner of OLD' }, 'QF-1 · winner', '#match-source'],
      [{ kind: 'loser', matchId: 'missing', matchCode: 'MISS', label: 'Loser of MISS' }, 'MISS · loser', '#match-missing'],
      [{ kind: 'group-rank', groupKey: 'A', rank: 1, label: '1st · A' }, '1st · A', '#group-a'],
      [{ kind: 'swiss-pairing', afterRound: 2, pairNumber: 1, seat: 1, label: 'Pair after round 2' }, 'Pair after round 2', '#round-2'],
    ];
    refs.forEach(([slot, name, href]) => {
      const participantMatch = viewWithSlots(slot, { kind: 'team', teamId: away.id, label: away.name });
      const { unmount } = render(<MatchCard match={participantMatch} matchesById={new Map([['source', source]])} interactive={false} />);
      if (href) expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
      else expect(screen.getByText(name)).toBeInTheDocument();
      unmount();
    });
    const groupWinner: ParticipantSlot = { kind: 'group-winner-rank', groupKeys: ['A', 'B'], rank: 1, label: 'Top group winner' };
    render(<MatchCard match={viewWithSlots(groupWinner, { kind: 'team', teamId: away.id, label: away.name })} matchesById={new Map()} interactive={false} />);
    expect(screen.getByText('Top group winner ·')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'A' })).toHaveAttribute('href', '#group-a');
    expect(screen.getByRole('link', { name: 'B' })).toHaveAttribute('href', '#group-b');
  });

  it('shows dependency links and a remainder count while retaining schedule and score details', () => {
    const dependencies = [source, ...Array.from({ length: 3 }, (_, index) => matchView({ id: `dep-${index}`, code: `DEP-${index}` }))];
    const match = matchView({
      id: 'linked',
      status: 'final',
      dependsOn: ['source', 'dep-0', 'dep-1', 'dep-2', 'not-loaded'],
      score: { home: 2, away: 0, winnerTeamId: home.id, finalizedAt: '2026-10-14T09:20:00.000Z' },
    });
    render(<MatchCard match={match} matchesById={new Map(dependencies.map((item) => [item.id, item]))} interactive />);
    expect(screen.getByRole('link', { name: 'QF-1' })).toHaveAttribute('href', '#match-source');
    expect(screen.getAllByTestId('match-card__dependency-link')).toHaveLength(3);
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Final')).toBeInTheDocument();
    expect(screen.getByText('Result final · points are recorded in the event ledger.')).toBeInTheDocument();
  });

  it('saves a staged score and updates the input values from changed props', async () => {
    const user = userEvent.setup();
    const onSaveScore = vi.fn(async () => undefined);
    const { rerender } = render(<MatchCard match={base} matchesById={new Map()} interactive onSaveScore={onSaveScore} />);
    fireEvent.change(screen.getByTestId('match-card__home-score'), { target: { value: '4' } });
    fireEvent.change(screen.getByTestId('match-card__away-score'), { target: { value: '2' } });
    await user.click(screen.getByTestId('match-card__save-score'));
    expect(onSaveScore).toHaveBeenCalledWith('match-1', { home: 4, away: 2 });
    const scored = matchView({ score: { home: 5, away: 3, winnerTeamId: home.id, finalizedAt: null } });
    rerender(<MatchCard match={scored} matchesById={new Map()} interactive onSaveScore={onSaveScore} />);
    expect(screen.getByTestId('match-card__home-score')).toHaveValue(5);
    expect(screen.getByTestId('match-card__away-score')).toHaveValue(3);
  });

  it('offers an advancement choice for a live tie and finalises the selected team', async () => {
    const user = userEvent.setup();
    const live = matchView({
      status: 'live',
      score: { home: 2, away: 2, winnerTeamId: null, finalizedAt: null },
    });
    const onSaveScore = vi.fn(async () => undefined);
    const onFinalize = vi.fn(async () => undefined);
    render(<MatchCard match={live} matchesById={new Map()} interactive onSaveScore={onSaveScore} onFinalize={onFinalize} />);
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByTestId('match-card__save-score')).toHaveTextContent('Update live score');
    await user.selectOptions(screen.getByTestId('match-card__advancing-team'), home.id);
    await user.click(screen.getByTestId('match-card__finalize'));
    expect(onFinalize).toHaveBeenCalledWith('match-1', { home: 2, away: 2, advancingTeamId: home.id });
    await user.click(screen.getByTestId('match-card__save-score'));
    expect(onSaveScore).toHaveBeenCalledWith('match-1', { home: 2, away: 2 });
  });

  it('hides score entry for unresolved and called-off matches, and respects disabled state', () => {
    const unresolved = viewWithSlots(
      { kind: 'winner', matchId: 'source', matchCode: 'QF-1', label: 'Winner of QF-1' },
      { kind: 'team', teamId: away.id, label: away.name },
    );
    const { rerender } = render(<MatchCard match={unresolved} matchesById={new Map()} interactive />);
    expect(screen.getByText('Waiting for the linked match or group table to decide these teams.')).toBeInTheDocument();
    expect(screen.queryByTestId('match-card__save-score')).not.toBeInTheDocument();
    rerender(<MatchCard match={base} matchesById={new Map()} interactive disabled />);
    expect(screen.queryByTestId('match-card__save-score')).not.toBeInTheDocument();
    rerender(<MatchCard match={matchView({ status: 'cancelled' })} matchesById={new Map()} interactive />);
    expect(screen.getByText('Called off')).toBeInTheDocument();
    expect(screen.queryByTestId('match-card__save-score')).not.toBeInTheDocument();
  });

  it('handles absent score callbacks and non-tied live scores', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<MatchCard match={base} matchesById={new Map()} interactive />);
    await user.click(screen.getByTestId('match-card__save-score'));
    const live = matchView({ status: 'live', score: { home: 2, away: 1, winnerTeamId: home.id, finalizedAt: null } });
    rerender(<MatchCard match={live} matchesById={new Map()} interactive />);
    expect(screen.queryByTestId('match-card__advancing-team')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('match-card__finalize'));
    expect(screen.getByTestId('match-card__finalize')).toBeInTheDocument();
  });
});
