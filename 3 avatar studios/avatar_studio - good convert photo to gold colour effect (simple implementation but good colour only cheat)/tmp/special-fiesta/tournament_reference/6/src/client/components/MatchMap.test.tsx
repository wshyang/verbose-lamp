// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { matchView } from '../../test/fixtures.js';
import type { MatchSection } from '../presentation.js';
import { MatchMap } from './MatchMap.js';

afterEach(cleanup);

describe('MatchMap', () => {
  it('explains an empty event', () => {
    render(<MatchMap matches={[]} sections={[]} />);
    expect(screen.getByTestId('match-map__empty')).toBeInTheDocument();
    expect(screen.getByText('No matches staged yet')).toBeInTheDocument();
  });

  it('renders grouped pathways, anchors, counts, and interactive match cards', () => {
    const first = matchView({ id: 'group-match', code: 'A1', groupKey: 'A' });
    const second = matchView({
      id: 'final-match', code: 'FINAL', roundNumber: 2, phase: 'Final',
      participants: [
        { reference: { kind: 'winner', matchId: first.id, matchCode: first.code, label: 'Winner A1' }, displayName: 'Winner A1', resolvedTeamId: first.participants[0].resolvedTeamId },
        first.participants[1],
      ],
      dependsOn: [first.id],
    });
    const sections: MatchSection[] = [
      { key: 'group-a', title: 'Group A', matches: [first] },
      { key: 'round-2', title: 'Round 2 · Final', matches: [second] },
    ];
    const onSaveScore = vi.fn(async () => undefined);
    render(<MatchMap matches={[first, second]} sections={sections} interactive disabled onSaveScore={onSaveScore} />);
    expect(screen.getByTestId('match-map')).toBeInTheDocument();
    expect(screen.getByText('2 matches · connected by result references')).toBeInTheDocument();
    expect(document.getElementById('group-a')).toBeInTheDocument();
    expect(document.getElementById('round-2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'A1' })).toHaveAttribute('href', '#match-group-match');
    expect(screen.queryByTestId('match-card__save-score')).not.toBeInTheDocument();
    expect(onSaveScore).not.toHaveBeenCalled();
  });
});
