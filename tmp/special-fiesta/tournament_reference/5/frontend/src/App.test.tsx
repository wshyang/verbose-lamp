// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.js';
import { api } from './lib/api.js';

vi.mock('./lib/api.js', () => ({
  api: {
    listTournaments: vi.fn(async () => []),
    getTournament: vi.fn(),
    createTournament: vi.fn(),
    stageManualMatch: vi.fn(),
    startMatch: vi.fn(),
    scoreMatch: vi.fn(),
    finaliseMatch: vi.fn(),
    cancelMatch: vi.fn(),
    assignPoints: vi.fn(),
    voidPoints: vi.fn(),
    applyContingency: vi.fn(),
    closeTournament: vi.fn(),
  },
}));

const mocked = vi.mocked(api);

const graph = {
  tournament: {
    id: 't1', name: 'Live Cup', mode: 'round-robin', status: 'live',
    config: {
      courts: 1, matchLengthMinutes: 20, tournamentLengthMinutes: 480,
      startMinutes: 540, restMinutes: 5, winPoints: 3, drawPoints: 1, lossPoints: 0,
    },
  },
  teams: [{ id: 'a', name: 'Alpha', seed: 1 }, { id: 'b', name: 'Bravo', seed: 2 }],
  courts: [{ id: 'c1', name: 'Court 1' }],
  matches: [{
    id: 'm1', key: 'M1', phase: 'Round 1', groupKey: null, round: 1,
    slotA: { kind: 'team', teamRef: 'a', label: 'Alpha' },
    slotB: { kind: 'team', teamRef: 'b', label: 'Bravo' },
    dependsOn: [], courtId: 'c1', courtName: 'Court 1', startMinutes: 540, endMinutes: 560,
    status: 'scheduled', scoreA: null, scoreB: null, origin: 'generated',
  }],
  pointsEntries: [],
  standings: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked.listTournaments.mockResolvedValue([]);
});

describe('App', () => {
  it('simulates, switches views and reports fit', async () => {
    render(<App />);
    expect(screen.getByText('Tournament Engine')).toBeInTheDocument();
    expect(screen.getByTestId('summary__match-count')).toHaveTextContent('28');
    expect(screen.getByTestId('summary__fit-message')).toHaveTextContent('it fits');
    fireEvent.click(screen.getByTestId('app__timeline-tab'));
    expect(screen.getByTestId('timeline__table')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('app__bracket-tab'));
    expect(screen.getByTestId('bracket__columns')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('controls__mode-select'), { target: { value: 'consolation' } });
    fireEvent.change(screen.getByTestId('controls__teams-input'), { target: { value: '6' } });
    expect(screen.getByTestId('app__no-simulation')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('controls__teams-input'), { target: { value: '8' } });
    expect(screen.getByTestId('bracket__columns')).toBeInTheDocument();
  });

  it('reports an overrun honestly', () => {
    render(<App />);
    fireEvent.change(screen.getByTestId('controls__tournament-length-input'), { target: { value: '60' } });
    expect(screen.getByTestId('summary__fit-message')).toHaveTextContent('overruns');
  });

  it('shows the live bracket once a tournament is open', async () => {
    mocked.listTournaments.mockResolvedValue([graph.tournament] as never);
    mocked.createTournament.mockResolvedValue(graph as never);
    render(<App />);
    fireEvent.click(screen.getByTestId('desk__create-button'));
    expect(await screen.findByText('Live bracket — Live Cup')).toBeInTheDocument();
  });
});
