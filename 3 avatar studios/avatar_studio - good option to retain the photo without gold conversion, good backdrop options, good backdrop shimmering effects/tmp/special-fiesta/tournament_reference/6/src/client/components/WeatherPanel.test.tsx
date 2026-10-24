// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tournamentRecord } from '../../test/fixtures.js';
import { WeatherPanel } from './WeatherPanel.js';

afterEach(cleanup);

const tournament = tournamentRecord();
const weather = { courtCount: 2, matchDurationMinutes: 20, effectiveAtMinutes: 540 };

function props(overrides: Partial<React.ComponentProps<typeof WeatherPanel>> = {}) {
  return {
    tournament,
    weather,
    busy: false,
    disabled: false,
    onChange: vi.fn(),
    onApply: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('WeatherPanel', () => {
  it('expands, updates resources and effective time, and applies the replanning request', async () => {
    const user = userEvent.setup();
    const view = props();
    render(<WeatherPanel {...view} />);
    const toggle = screen.getByTestId('weather-panel__toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('weather-panel__courts')).not.toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('weather-panel__effective-time')).toHaveValue('09:00');
    fireEvent.change(screen.getByTestId('weather-panel__courts'), { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('weather-panel__duration'), { target: { value: '35' } });
    fireEvent.change(screen.getByTestId('weather-panel__effective-time'), { target: { value: '12:15' } });
    await user.click(screen.getByTestId('weather-panel__apply'));
    expect(view.onChange).toHaveBeenNthCalledWith(1, 'courtCount', 1);
    expect(view.onChange).toHaveBeenNthCalledWith(2, 'matchDurationMinutes', 35);
    expect(view.onChange).toHaveBeenNthCalledWith(3, 'effectiveAtMinutes', 735);
    expect(view.onApply).toHaveBeenCalledOnce();
    expect(screen.getByText('Current settings: 2 courts · 20 min per match')).toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('wraps the displayed clock over midnight and handles an empty time field', () => {
    const view = props({ weather: { ...weather, effectiveAtMinutes: 1470 } });
    render(<WeatherPanel {...view} />);
    // Expand through the accessible control before changing the time value.
    const toggle = screen.getByTestId('weather-panel__toggle');
    fireEvent.click(toggle);
    expect(screen.getByTestId('weather-panel__effective-time')).toHaveValue('00:30');
    fireEvent.change(screen.getByTestId('weather-panel__effective-time'), { target: { value: '' } });
    expect(view.onChange).toHaveBeenCalledWith('effectiveAtMinutes', 0);
  });

  it('disables edits when the event is closed and disables apply while busy', async () => {
    const user = userEvent.setup();
    const closed = props({ disabled: true });
    const { rerender } = render(<WeatherPanel {...closed} />);
    await user.click(screen.getByTestId('weather-panel__toggle'));
    expect(screen.getByTestId('weather-panel__courts')).toBeDisabled();
    expect(screen.getByTestId('weather-panel__apply')).toBeDisabled();
    rerender(<WeatherPanel {...props({ busy: true })} />);
    expect(screen.getByTestId('weather-panel__apply')).toBeDisabled();
  });
});
