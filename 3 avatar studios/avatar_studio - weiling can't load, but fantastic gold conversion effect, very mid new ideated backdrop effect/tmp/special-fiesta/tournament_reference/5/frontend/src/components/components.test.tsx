// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSimulation } from '../lib/hooks/useSimulation.js';
import ControlsPanel from './ControlsPanel.js';
import BracketView from './BracketView.js';
import TimelineTable from './TimelineTable.js';
import StandingsTable from './StandingsTable.js';
import { generateFormat } from '../../../shared/formats/index.js';
import type { MatchView } from '../../../shared/types.js';
import { simulate } from '../../../shared/schedule.js';

const config = {
  courts: 2, matchLengthMinutes: 20, startMinutes: 540, restMinutes: 0,
  tournamentLengthMinutes: 480,
};

function ControlsHarness() {
  const simulation = useSimulation();
  return <ControlsPanel simulation={simulation} />;
}

describe('ControlsPanel', () => {
  it('switches modes and edits every scheduling input', () => {
    render(<ControlsHarness />);
    fireEvent.change(screen.getByTestId('controls__mode-select'), { target: { value: 'swiss' } });
    fireEvent.change(screen.getByTestId('controls__teams-input'), { target: { value: '10' } });
    fireEvent.change(screen.getByTestId('controls__courts-input'), { target: { value: '3' } });
    fireEvent.change(screen.getByTestId('controls__match-length-input'), { target: { value: '25' } });
    fireEvent.change(screen.getByTestId('controls__tournament-length-input'), { target: { value: '600' } });
    fireEvent.change(screen.getByTestId('controls__rest-input'), { target: { value: '7' } });
    fireEvent.change(screen.getByTestId('controls__start-time-input'), { target: { value: '10:00' } });
    expect((screen.getByTestId('controls__mode-select') as HTMLSelectElement).value).toBe('swiss');
  });

  it('shows the format validation error for an impossible field', () => {
    render(<ControlsHarness />);
    fireEvent.change(screen.getByTestId('controls__mode-select'), { target: { value: 'consolation' } });
    fireEvent.change(screen.getByTestId('controls__teams-input'), { target: { value: '6' } });
    expect(screen.getByTestId('controls__validation-error')).toHaveTextContent('exactly 8');
  });
});

describe('BracketView', () => {
  it('renders rounds left to right with placeholder links', () => {
    const result = simulate(generateFormat('single-elimination', 8), config);
    render(<BracketView matches={result.matches} />);
    const cards = screen.getAllByTestId('bracket__match-card');
    expect(cards).toHaveLength(7);
    expect(screen.getByText('Winner of SE-R1M1')).toBeInTheDocument();
    expect(screen.getByText('↳ Winner of SE-R1M1')).toBeInTheDocument();
    expect(screen.getByText(/winners flow left to right/)).toBeInTheDocument();
  });

  it('flags back-to-back ironman matches and bye matches', () => {
    const ironman = simulate(generateFormat('ironman', 4), config);
    const { unmount } = render(<BracketView matches={ironman.matches} />);
    expect(screen.getAllByText(/Back-to-back/).length).toBeGreaterThan(0);
    unmount();
    const swiss = simulate(generateFormat('swiss', 3), config);
    render(<BracketView matches={swiss.matches} />);
    expect(screen.getAllByText('No court (bye)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bye — no court time').length).toBeGreaterThan(0);
  });

  it('renders live matches without a court', () => {
    const live: MatchView = {
      id: 'x', key: 'MAN-1', phase: 'Manual Match', groupKey: null, round: 1,
      slotA: { kind: 'team', teamRef: 'a', label: 'Alpha' },
      slotB: { kind: 'team', teamRef: 'b', label: 'Bravo' },
      dependsOn: [], courtId: null, courtName: null, startMinutes: 600, endMinutes: 620,
      status: 'scheduled', scoreA: null, scoreB: null, origin: 'manual',
    };
    const { unmount } = render(<BracketView matches={[live]} />);
    expect(screen.getByText('No court (bye)')).toBeInTheDocument();
    unmount();
    render(<TimelineTable matches={[live]} />);
    expect(screen.getByTestId('timeline__table')).toBeInTheDocument();
  });

  it('renders an empty state', () => {
    render(<BracketView matches={[]} />);
    expect(screen.getByTestId('bracket__empty')).toBeInTheDocument();
  });
});

describe('TimelineTable and StandingsTable', () => {
  it('sorts matches chronologically with byes last', () => {
    const swiss = simulate(generateFormat('swiss', 5), config);
    render(<TimelineTable matches={swiss.matches} />);
    const rows = screen.getAllByTestId('timeline__row');
    expect(rows.length).toBe(swiss.matches.length);
    expect(within(rows[rows.length - 1]).getByText('Bye')).toBeInTheDocument();
  });

  it('renders standings with explanations and an empty state', () => {
    const { unmount } = render(<StandingsTable standings={[]} />);
    expect(screen.getByTestId('standings__empty')).toBeInTheDocument();
    unmount();
    render(<StandingsTable standings={[{
      teamId: 'a', name: 'Alpha', seed: 1, points: 3, played: 1, wins: 1,
      draws: 0, losses: 0, scoredFor: 10, scoredAgainst: 4, scoreDifference: 6, rank: 1,
    }]} />);
    const row = screen.getByTestId('standings__row');
    expect(within(row).getByText('Alpha')).toBeInTheDocument();
    expect(within(row).getByText(/seed 1 breaks any remaining tie/)).toBeInTheDocument();
  });
});
