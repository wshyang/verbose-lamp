// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { usePartySparklers } from '../hooks/usePartySparklers';
import { DEFAULT_SPARKLER_ORIGIN, DEFAULT_SPARKLER_SETTINGS, SPARKLER_LIMITS } from '../model/sparklerSettings';
import { PartySparklerLauncher } from './PartySparklerLauncher';

const play = vi.fn();

vi.mock('@/features/spectacle', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/spectacle')>();
  return { ...actual, useSpectacle: () => ({ play, qualityTier: 'high' }) };
});

function Harness() {
  const sparklers = usePartySparklers();
  return <PartySparklerLauncher sparklers={sparklers} />;
}

describe('PartySparklerLauncher', () => {
  it('opens and closes its small overlay from the button', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const launch = screen.getByTestId('party-sparklers__launch');
    expect(screen.queryByTestId('party-sparklers__overlay')).toBeNull();
    await user.click(launch);
    expect(screen.getByTestId('party-sparklers__overlay')).not.toBeNull();
    expect(launch.getAttribute('aria-expanded')).toBe('true');
    await user.click(screen.getByTestId('party-sparklers__close'));
    expect(screen.queryByTestId('party-sparklers__overlay')).toBeNull();
  });

  it('shows the default fan', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByTestId('party-sparklers__launch'));
    expect((screen.getByTestId('party-sparklers__count') as HTMLInputElement).value).toBe(
      String(DEFAULT_SPARKLER_SETTINGS.count)
    );
    expect(screen.getByTestId('party-sparklers__duration-readout').textContent).toBe('3.2s');
  });

  it('clamps the sliders and follows them in the readouts', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByTestId('party-sparklers__launch'));

    fireEvent.change(screen.getByTestId('party-sparklers__count'), { target: { value: '5' } });
    expect(screen.getByTestId('party-sparklers__count-readout').textContent).toBe('5');

    fireEvent.change(screen.getByTestId('party-sparklers__duration'), { target: { value: '9' } });
    expect(screen.getByTestId('party-sparklers__duration-readout').textContent).toBe(
      `${SPARKLER_LIMITS.durationSec.max}s`
    );

    fireEvent.change(screen.getByTestId('party-sparklers__spread'), { target: { value: '0.01' } });
    expect(screen.getByTestId('party-sparklers__spread-readout').textContent).toBe(
      String(SPARKLER_LIMITS.spread.min)
    );
  });

  it('lights the fan at the default origin and closes the overlay', async () => {
    const user = userEvent.setup();
    play.mockClear();
    render(<Harness />);
    await user.click(screen.getByTestId('party-sparklers__launch'));
    fireEvent.change(screen.getByTestId('party-sparklers__count'), { target: { value: '4' } });
    await user.click(screen.getByTestId('party-sparklers__light'));

    expect(play).toHaveBeenCalledWith('sparklers', {
      origin: DEFAULT_SPARKLER_ORIGIN,
      count: 4,
      durationMs: Math.round(DEFAULT_SPARKLER_SETTINGS.durationSec * 1000),
      spread: DEFAULT_SPARKLER_SETTINGS.spread,
    });
    expect(screen.queryByTestId('party-sparklers__overlay')).toBeNull();
  });
});
