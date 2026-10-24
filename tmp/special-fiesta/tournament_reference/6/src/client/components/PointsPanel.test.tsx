// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pointEntry, team } from '../../test/fixtures.js';
import { PointsPanel } from './PointsPanel.js';

afterEach(cleanup);

const teams = [
  team('team-1', 'Northside', 1),
  team('team-2', 'River Club', 2),
  { ...team('team-3', 'Old Town', 3), withdrawnAt: '2026-10-14T10:00:00.000Z', withdrawalReason: 'Withdrawn' },
];

function props(overrides: Partial<React.ComponentProps<typeof PointsPanel>> = {}) {
  return {
    teams,
    entries: [],
    disabled: false,
    busy: false,
    onAward: vi.fn(async () => undefined),
    onVoid: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('PointsPanel', () => {
  it('awards a positive amount to an active team with a reason', async () => {
    const user = userEvent.setup();
    const view = props();
    render(<PointsPanel {...view} />);
    expect(screen.getByTestId('points-panel__team')).toHaveValue('team-1');
    expect(screen.queryByRole('option', { name: 'Old Town' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByTestId('points-panel__team'), 'team-2');
    fireEvent.change(screen.getByTestId('points-panel__amount'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('points-panel__reason'), { target: { value: 'Helping set up' } });
    await user.click(screen.getByTestId('points-panel__award'));
    expect(view.onAward).toHaveBeenCalledWith({ teamId: 'team-2', points: 5, reason: 'Helping set up' });
    expect(screen.getByText('No point movements yet.')).toBeInTheDocument();
  });

  it('requires points and a nonblank reason, and honours closed/busy state', async () => {
    const view = props();
    render(<PointsPanel {...view} />);
    const award = screen.getByTestId('points-panel__award');
    fireEvent.change(screen.getByTestId('points-panel__amount'), { target: { value: '0' } });
    expect(award).toBeDisabled();
    fireEvent.change(screen.getByTestId('points-panel__amount'), { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('points-panel__reason'), { target: { value: '   ' } });
    expect(award).toBeDisabled();
    cleanup();
    render(<PointsPanel {...props({ busy: true })} />);
    expect(screen.getByTestId('points-panel__award')).toBeDisabled();
    cleanup();
    render(<PointsPanel {...props({ disabled: true })} />);
    expect(screen.getByTestId('points-panel__team')).toBeDisabled();
    expect(screen.getByTestId('points-panel__award')).toBeDisabled();
    expect(view.onAward).not.toHaveBeenCalled();
  });

  it('shows the newest ledger entries first and reverses only eligible awards', async () => {
    const user = userEvent.setup();
    const entries = [
      pointEntry({ id: 'award', teamName: 'Northside', points: 3, kind: 'outcome-award', reason: 'Match win' }),
      pointEntry({ id: 'voided', teamName: 'River Club', points: 4, kind: 'desk-award', voided: true, reason: 'Corrected' }),
      pointEntry({ id: 'reversal', teamName: 'Old Town', points: -2, kind: 'void', reason: 'Voided: typo' }),
    ];
    const view = props({ entries });
    render(<PointsPanel {...view} />);
    const ledger = screen.getByTestId('points-panel__ledger');
    const rows = within(ledger).getAllByRole('article');
    expect(rows[0]).toHaveTextContent('Voided: typo');
    expect(rows[1]).toHaveTextContent('Corrected');
    expect(rows[1]).toHaveTextContent('Voided');
    expect(rows[2]).toHaveTextContent('Match win');
    expect(rows[2]).toHaveTextContent('Match result');
    expect(screen.getAllByTestId('points-panel__void')).toHaveLength(1);
    fireEvent.change(screen.getByTestId('points-panel__reason'), { target: { value: 'Entered by mistake' } });
    await user.click(screen.getByTestId('points-panel__void'));
    expect(view.onVoid).toHaveBeenCalledWith('award', 'Entered by mistake');
  });

  it('renders safely without any active teams', () => {
    render(<PointsPanel {...props({ teams: [] })} />);
    expect(screen.getByTestId('points-panel__team')).toHaveProperty('options.length', 0);
    expect(screen.getByTestId('points-panel__award')).toBeDisabled();
  });

  it('hides all reversals while disabled, busy, or without a reason', () => {
    const entries = [pointEntry({ id: 'award' })];
    const { rerender } = render(<PointsPanel {...props({ entries, busy: true })} />);
    expect(screen.queryByTestId('points-panel__void')).not.toBeInTheDocument();
    rerender(<PointsPanel {...props({ entries, disabled: true })} />);
    expect(screen.queryByTestId('points-panel__void')).not.toBeInTheDocument();
    rerender(<PointsPanel {...props({ entries })} />);
    fireEvent.change(screen.getByTestId('points-panel__reason'), { target: { value: ' ' } });
    expect(screen.queryByTestId('points-panel__void')).not.toBeInTheDocument();
  });
});
