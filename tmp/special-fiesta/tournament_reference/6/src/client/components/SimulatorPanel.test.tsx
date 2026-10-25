// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SimulationResult, TournamentSettings } from '../../shared/contracts.js';
import { formats, matchView, scheduleSummary } from '../../test/fixtures.js';
import { SimulatorPanel } from './SimulatorPanel.js';

const settings: TournamentSettings = {
  teamCount: 4,
  courtCount: 2,
  matchDurationMinutes: 20,
  tournamentLengthMinutes: 240,
  startTimeMinutes: 540,
};
const teamNames = ['Northside', 'River Club', 'Old Town', 'Hilltop'];
afterEach(cleanup);

const preview: SimulationResult = {
  mode: 'single-elimination',
  teams: [],
  matches: [matchView()],
  scheduleSummary: scheduleSummary(),
  groupKeys: [],
};

function props(overrides: Partial<React.ComponentProps<typeof SimulatorPanel>> = {}) {
  return {
    formats,
    selectedMode: 'single-elimination' as const,
    settings,
    tournamentName: 'Saturday Cup',
    teamNames,
    preview: null,
    busy: false,
    onModeChange: vi.fn(),
    onSettingChange: vi.fn(),
    onTeamCountChange: vi.fn(),
    onNameChange: vi.fn(),
    onTeamNamesChange: vi.fn(),
    onPreview: vi.fn(async () => undefined),
    onCreate: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('SimulatorPanel', () => {
  it('renders the empty simulation state and wires tournament setup controls', async () => {
    const user = userEvent.setup();
    const view = props();
    render(<SimulatorPanel {...view} />);
    expect(screen.getByText('See how the day fits')).toBeInTheDocument();
    expect(screen.getByText(/Nothing is pre-decided/)).toBeInTheDocument();
    expect(screen.getByTestId('tournament-config__start-time')).toHaveValue('09:00');
    fireEvent.change(screen.getByTestId('tournament-config__name'), { target: { value: 'Sunday Cup' } });
    await user.selectOptions(screen.getByTestId('mode-picker__mode'), 'world-cup');
    fireEvent.change(screen.getByTestId('tournament-config__teams'), { target: { value: '16' } });
    fireEvent.change(screen.getByTestId('tournament-config__courts'), { target: { value: '4' } });
    fireEvent.change(screen.getByTestId('tournament-config__match-length'), { target: { value: '25' } });
    fireEvent.change(screen.getByTestId('tournament-config__tournament-length'), { target: { value: '360' } });
    fireEvent.change(screen.getByTestId('tournament-config__start-time'), { target: { value: '10:30' } });
    fireEvent.change(screen.getByTestId('tournament-config__team-list'), { target: { value: ' Northside \n\n River Club \n Old Town ' } });
    await user.click(screen.getByTestId('simulator__preview'));
    await user.click(screen.getByTestId('simulator__create'));
    expect(view.onNameChange).toHaveBeenLastCalledWith('Sunday Cup');
    expect(view.onModeChange).toHaveBeenCalledWith('world-cup');
    expect(view.onTeamCountChange).toHaveBeenCalledWith(16);
    expect(view.onSettingChange).toHaveBeenCalledWith('courtCount', 4);
    expect(view.onSettingChange).toHaveBeenCalledWith('matchDurationMinutes', 25);
    expect(view.onSettingChange).toHaveBeenCalledWith('tournamentLengthMinutes', 360);
    expect(view.onSettingChange).toHaveBeenCalledWith('startTimeMinutes', 630);
    expect(view.onTeamNamesChange).toHaveBeenCalledWith(['Northside', 'River Club', 'Old Town']);
    expect(view.onPreview).toHaveBeenCalledOnce();
    expect(view.onCreate).toHaveBeenCalledOnce();
  });

  it('shows an exact fixed team count and disables setup actions while busy', () => {
    render(<SimulatorPanel {...props({ selectedMode: 'ironman', busy: true })} />);
    expect(screen.getByTestId('tournament-config__teams')).toBeDisabled();
    expect(screen.getByTestId('simulator__preview')).toBeDisabled();
    expect(screen.getByTestId('simulator__create')).toBeDisabled();
  });

  it('renders a preview pathway and switches to the sorted court timeline', async () => {
    const user = userEvent.setup();
    render(<SimulatorPanel {...props({ preview })} />);
    expect(screen.getByText('Within the day budget')).toBeInTheDocument();
    expect(screen.getByText('1 hr')).toBeInTheDocument();
    expect(screen.getByTestId('match-map')).toBeInTheDocument();
    await user.click(screen.getByTestId('simulator__timeline-view'));
    expect(screen.getByTestId('simulator__timeline')).toBeInTheDocument();
    expect(screen.getByText('R1-M1 · Round 1')).toBeInTheDocument();
    await user.click(screen.getByTestId('simulator__map-view'));
    expect(screen.getByTestId('match-map')).toBeInTheDocument();
  });

  it('shows an over-budget estimate and falls back for an unavailable format', () => {
    render(<SimulatorPanel {...props({
      formats: [],
      selectedMode: 'world-cup',
      preview: { ...preview, scheduleSummary: scheduleSummary({ fits: false, finishTimeMinutes: 780 }) },
    })} />);
    expect(screen.getByText('Longer than the day budget')).toBeInTheDocument();
    expect(screen.getByText('1:00 PM')).toBeInTheDocument();
    expect(screen.getByTestId('tournament-config__teams')).toHaveAttribute('max', '32');
    expect(screen.queryByText('See how the day fits')).not.toBeInTheDocument();
  });
});
