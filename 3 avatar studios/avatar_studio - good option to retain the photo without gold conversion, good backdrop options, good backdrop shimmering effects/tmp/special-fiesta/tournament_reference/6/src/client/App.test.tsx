// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TournamentSettings } from '../shared/contracts.js';
import { snapshot, tournamentRecord } from '../test/fixtures.js';
import { App } from './App.js';
import { useTournamentDesk } from './hooks/useTournamentDesk.js';

vi.mock('./hooks/useTournamentDesk.js', () => ({ useTournamentDesk: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const settings: TournamentSettings = {
  teamCount: 4,
  courtCount: 2,
  matchDurationMinutes: 20,
  tournamentLengthMinutes: 240,
  startTimeMinutes: 540,
};
const event = snapshot({ tournament: tournamentRecord({ id: 'event-2', name: 'Sunday Cup' }) });

function deskState(overrides: Record<string, unknown> = {}) {
  return {
    formats: [],
    recentTournaments: [],
    selectedMode: 'single-elimination',
    settings,
    tournamentName: 'Saturday Cup',
    teamNames: ['Northside', 'River Club', 'Old Town', 'Hilltop'],
    preview: null,
    tournament: null,
    activeView: 'simulator',
    matchSections: [],
    timeline: [],
    weather: { courtCount: 2, matchDurationMinutes: 20, effectiveAtMinutes: 540 },
    loading: false,
    busy: false,
    error: '',
    setTournamentName: vi.fn(),
    setTeamNames: vi.fn(),
    setActiveView: vi.fn(),
    changeMode: vi.fn(),
    updateSetting: vi.fn(),
    updateTeamCount: vi.fn(),
    updateWeather: vi.fn(),
    previewFormat: vi.fn(async () => undefined),
    createTournament: vi.fn(async () => undefined),
    openTournament: vi.fn(async () => undefined),
    applyWeatherChange: vi.fn(async () => undefined),
    stageMatch: vi.fn(async () => undefined),
    saveLiveScore: vi.fn(async () => undefined),
    finalizeMatch: vi.fn(async () => undefined),
    awardPoints: vi.fn(async () => undefined),
    voidPointAward: vi.fn(async () => undefined),
    closeTournament: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as ReturnType<typeof useTournamentDesk>;
}

describe('App shell', () => {
  it('shows the loading state, then the simulator and optional global error', async () => {
    const user = userEvent.setup();
    vi.mocked(useTournamentDesk).mockReturnValue(deskState({ loading: true }));
    const { rerender } = render(<App />);
    expect(screen.getByTestId('app__loading')).toHaveTextContent('Connecting to the tournament desk');
    const desk = deskState({ error: 'Simulation could not be loaded.' });
    vi.mocked(useTournamentDesk).mockReturnValue(desk);
    rerender(<App />);
    expect(screen.getByRole('heading', { name: /Run the day/ })).toBeInTheDocument();
    expect(screen.getByTestId('app__error')).toHaveTextContent('Simulation could not be loaded.');
    expect(screen.getByRole('link', { name: 'Matchday home' })).toHaveAttribute('href', '#top');
    expect(screen.getByTestId('app__help')).toHaveAttribute('href', '#guide');
    expect(document.getElementById('guide')).toBeInTheDocument();
    await user.click(screen.getByTestId('simulator__preview'));
    expect(desk.previewFormat).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('app__simulator-tab')).not.toBeInTheDocument();
  });

  it('opens recent events and switches between simulator and tournament desk views', async () => {
    const user = userEvent.setup();
    const desk = deskState({
      recentTournaments: [event.tournament],
      tournament: event,
      activeView: 'simulator',
    });
    vi.mocked(useTournamentDesk).mockReturnValue(desk);
    const { rerender } = render(<App />);
    const recent = screen.getByTestId('tournament-selector__recent');
    expect(recent).toHaveValue('event-2');
    fireEvent.change(recent, { target: { value: '' } });
    expect(desk.openTournament).not.toHaveBeenCalled();
    fireEvent.change(recent, { target: { value: 'event-2' } });
    expect(desk.openTournament).toHaveBeenCalledWith('event-2');
    await user.click(screen.getByTestId('app__tournament-tab'));
    expect(desk.setActiveView).toHaveBeenCalledWith('tournament');
    vi.mocked(useTournamentDesk).mockReturnValue({ ...desk, activeView: 'tournament' });
    rerender(<App />);
    expect(screen.getByRole('heading', { name: 'Sunday Cup' })).toBeInTheDocument();
    expect(screen.getByTestId('app__tournament-tab')).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByTestId('app__simulator-tab'));
    expect(desk.setActiveView).toHaveBeenCalledWith('simulator');
  });

  it('keeps the recent-event selector at its placeholder while no event is open', () => {
    vi.mocked(useTournamentDesk).mockReturnValue(deskState({ recentTournaments: [event.tournament] }));
    render(<App />);
    expect(screen.getByTestId('tournament-selector__recent')).toHaveValue('');
  });

  it('falls back to the simulator when tournament view is selected without an event', () => {
    vi.mocked(useTournamentDesk).mockReturnValue(deskState({ activeView: 'tournament', tournament: null }));
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Set up a tournament' })).toBeInTheDocument();
    expect(screen.queryByTestId('app__tournament-tab')).not.toBeInTheDocument();
    expect(screen.getByText('No event open')).toBeInTheDocument();
  });
});
