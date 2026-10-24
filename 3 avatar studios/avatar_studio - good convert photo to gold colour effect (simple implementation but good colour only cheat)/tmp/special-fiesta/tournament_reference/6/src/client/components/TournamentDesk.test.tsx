// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WeatherChangeInput } from '../../shared/contracts.js';
import { buildMatchSections } from '../presentation.js';
import { matchView, pointEntry, snapshot, standing, tournamentRecord } from '../../test/fixtures.js';
import { TournamentDesk } from './TournamentDesk.js';

afterEach(cleanup);

const baseSnapshot = snapshot();
const weather: WeatherChangeInput = { courtCount: 2, matchDurationMinutes: 20, effectiveAtMinutes: 540 };

function props(overrides: Partial<React.ComponentProps<typeof TournamentDesk>> = {}) {
  const sections = buildMatchSections('single-elimination', baseSnapshot.matches);
  return {
    snapshot: baseSnapshot,
    sections,
    timeline: baseSnapshot.matches,
    weather,
    busy: false,
    error: '',
    onWeatherChange: vi.fn(),
    onApplyWeather: vi.fn(async () => undefined),
    onStageMatch: vi.fn(async () => undefined),
    onSaveScore: vi.fn(async () => undefined),
    onFinalizeMatch: vi.fn(async () => undefined),
    onAwardPoints: vi.fn(async () => undefined),
    onVoidPoints: vi.fn(async () => undefined),
    onClose: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('TournamentDesk', () => {
  it('shows a ready event, schedule summary, and its pathway map', () => {
    render(<TournamentDesk {...props()} />);
    expect(screen.getByRole('heading', { name: 'Saturday Cup' })).toBeInTheDocument();
    expect(screen.getByText('Live event · single elimination')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Projected duration')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Tournament match pathway' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('switches to a populated timeline and shows a capacity warning', async () => {
    const user = userEvent.setup();
    const longDay = snapshot({ scheduleSummary: { ...baseSnapshot.scheduleSummary, fits: false } });
    render(<TournamentDesk {...props({ snapshot: longDay, timeline: [baseSnapshot.matches[0]!] })} />);
    expect(screen.getByRole('status')).toHaveTextContent('runs beyond the day budget');
    await user.click(screen.getByTestId('tournament-desk__tab-timeline'));
    const timeline = screen.getByTestId('tournament-desk__timeline');
    expect(timeline).toBeInTheDocument();
    expect(within(timeline).getByText('Northside vs River Club')).toBeInTheDocument();
    expect(within(timeline).getByText('R1-M1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Northside vs River Club' })).toHaveAttribute('href', '#match-match-1');
  });

  it('shows an empty timeline when no games have been scheduled', async () => {
    const user = userEvent.setup();
    const empty = snapshot({ matches: [], scheduleSummary: { ...baseSnapshot.scheduleSummary, matchCount: 0 } });
    render(<TournamentDesk {...props({ snapshot: empty, sections: [], timeline: [] })} />);
    await user.click(screen.getByTestId('tournament-desk__tab-timeline'));
    expect(screen.getByText('No matches have been planned yet.')).toBeInTheDocument();
  });

  it('runs the scoring, staging, points, rain-plan, and close desk actions', async () => {
    const user = userEvent.setup();
    const live = matchView({ status: 'live', score: { home: 2, away: 1, winnerTeamId: 'team-1', finalizedAt: null } });
    const event = snapshot({
      tournament: tournamentRecord({ status: 'running' }),
      matches: [live],
      pointEntries: [pointEntry()],
      standings: [standing()],
    });
    const callbacks = props({
      snapshot: event,
      sections: buildMatchSections('single-elimination', event.matches),
      timeline: event.matches,
    });
    render(<TournamentDesk {...callbacks} />);
    await user.click(screen.getByTestId('tournament-desk__tab-desk'));
    expect(screen.getByRole('region', { name: 'Live scoring desk' })).toBeInTheDocument();
    await user.selectOptions(screen.getByTestId('manual-match__home-team'), 'team-2');
    await user.selectOptions(screen.getByTestId('manual-match__away-team'), 'team-1');
    await user.click(screen.getByTestId('manual-match__stage'));
    expect(callbacks.onStageMatch).toHaveBeenCalledWith({ homeTeamId: 'team-2', awayTeamId: 'team-1', phase: 'Desk-staged' });
    await user.click(screen.getByTestId('match-card__finalize'));
    expect(callbacks.onFinalizeMatch).toHaveBeenCalledWith('match-1', { home: 2, away: 1 });
    fireEvent.change(screen.getByTestId('points-panel__amount'), { target: { value: '3' } });
    await user.click(screen.getByTestId('points-panel__award'));
    expect(callbacks.onAwardPoints).toHaveBeenCalledWith({ teamId: 'team-1', points: 3, reason: 'Desk award' });
    await user.click(screen.getByTestId('points-panel__void'));
    expect(callbacks.onVoidPoints).toHaveBeenCalledWith('point-1', 'Desk award');
    fireEvent.change(screen.getByTestId('tournament-desk__close-reason'), { target: { value: 'Rain delay' } });
    await user.click(screen.getByTestId('tournament-desk__close'));
    expect(callbacks.onClose).toHaveBeenCalledWith('Rain delay');
    await user.click(screen.getByTestId('weather-panel__toggle'));
    fireEvent.change(screen.getByTestId('weather-panel__courts'), { target: { value: '1' } });
    await user.click(screen.getByTestId('weather-panel__apply'));
    expect(callbacks.onWeatherChange).toHaveBeenCalledWith('courtCount', 1);
    expect(callbacks.onApplyWeather).toHaveBeenCalledOnce();
  });

  it('renders standings and group tables on their tab', async () => {
    const user = userEvent.setup();
    const event = snapshot({
      standings: [standing()],
      groupStandings: { A: [standing()], B: [] },
    });
    render(<TournamentDesk {...props({ snapshot: event })} />);
    await user.click(screen.getByTestId('tournament-desk__tab-standings'));
    expect(screen.getByRole('region', { name: 'Tournament standings' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Overall standing' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Group A' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Group B' })).toBeInTheDocument();
  });

  it('shows errors and prevents closed-event desk actions', async () => {
    const user = userEvent.setup();
    const closed = snapshot({
      tournament: tournamentRecord({ status: 'closed', closingReason: 'Venue closed' }),
      matches: [],
      pointEntries: [],
    });
    render(<TournamentDesk {...props({ snapshot: closed, sections: [], timeline: [], busy: true, error: 'Event is closed.' })} />);
    expect(screen.getByTestId('tournament-desk__error')).toHaveTextContent('Event is closed.');
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.getByText('Venue closed')).toBeInTheDocument();
    expect(screen.queryByTestId('tournament-desk__close')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('tournament-desk__tab-desk'));
    expect(screen.getByTestId('manual-match__stage')).toBeDisabled();
    expect(screen.getByTestId('points-panel__award')).toBeDisabled();
  });
});
