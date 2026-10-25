// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { team } from '../../test/fixtures.js';
import { ManualMatchForm } from './ManualMatchForm.js';

afterEach(cleanup);

const teams = [
  team('team-1', 'Northside', 1),
  team('team-2', 'River Club', 2),
  { ...team('team-3', 'Old Town', 3), withdrawnAt: '2026-10-14T10:00:00.000Z', withdrawalReason: 'Injured' },
];

describe('ManualMatchForm', () => {
  it('stages a selected pair with the desk label', async () => {
    const user = userEvent.setup();
    const onStage = vi.fn(async () => undefined);
    render(<ManualMatchForm teams={teams} disabled={false} onStage={onStage} />);
    expect(screen.getByTestId('manual-match__home-team')).toHaveValue('team-1');
    expect(screen.getByTestId('manual-match__away-team')).toHaveValue('team-2');
    expect(screen.queryByRole('option', { name: 'Old Town' })).not.toBeInTheDocument();
    await user.clear(screen.getByTestId('manual-match__phase'));
    await user.type(screen.getByTestId('manual-match__phase'), 'Semi-final');
    await user.click(screen.getByTestId('manual-match__stage'));
    expect(onStage).toHaveBeenCalledWith({ homeTeamId: 'team-1', awayTeamId: 'team-2', phase: 'Semi-final' });
  });

  it('requires different teams and honours the disabled state', async () => {
    const user = userEvent.setup();
    const onStage = vi.fn(async () => undefined);
    render(<ManualMatchForm teams={teams} disabled={false} onStage={onStage} />);
    await user.selectOptions(screen.getByTestId('manual-match__away-team'), 'team-1');
    expect(screen.getByTestId('manual-match__stage')).toBeDisabled();
    await user.selectOptions(screen.getByTestId('manual-match__away-team'), 'team-2');
    expect(screen.getByTestId('manual-match__stage')).toBeEnabled();
    cleanup();
    render(<ManualMatchForm teams={teams} disabled onStage={onStage} />);
    expect(screen.getByTestId('manual-match__stage')).toBeDisabled();
    expect(onStage).not.toHaveBeenCalled();
  });

  it('explains when there are fewer than two active teams', () => {
    render(<ManualMatchForm teams={[]} disabled={false} onStage={vi.fn(async () => undefined)} />);
    expect(screen.getByTestId('manual-match__home-team')).toHaveProperty('options.length', 0);
    expect(screen.getByTestId('manual-match__away-team')).toHaveProperty('options.length', 0);
    expect(screen.getByText('Two active teams are needed to stage a match.')).toBeInTheDocument();
    expect(screen.getByTestId('manual-match__stage')).toBeDisabled();
    cleanup();
    render(<ManualMatchForm teams={[teams[0]!]} disabled={false} onStage={vi.fn(async () => undefined)} />);
    expect(screen.getByTestId('manual-match__home-team')).toHaveProperty('options.length', 1);
    expect(screen.getByTestId('manual-match__away-team')).toHaveProperty('options.length', 1);
    expect(screen.getByTestId('manual-match__stage')).toBeDisabled();
  });
});
