// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DemoHost } from './DemoHost';

vi.mock('./GatsbyPremiere', () => ({
  GatsbyPremiere: ({ onOpenEventNight }: { onOpenEventNight: () => void }) => (
    <button type="button" data-testid="demo-host__premiere" onClick={onOpenEventNight}>
      premiere
    </button>
  ),
}));

vi.mock('@/features/event-night', () => ({
  EventNightScreen: ({ onExit }: { onExit: () => void }) => (
    <button type="button" data-testid="demo-host__event-night" onClick={onExit}>
      event night
    </button>
  ),
}));

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('DemoHost', () => {
  it('mounts the premiere by default and switches to Event Night from the hash', async () => {
    render(<DemoHost />);
    await userEvent.click(screen.getByTestId('demo-host__premiere'));
    expect(window.location.hash).toBe('#event-night');
    expect(screen.getByTestId('demo-host__event-night')).toBeDefined();
    expect(screen.queryByTestId('demo-host__premiere')).toBeNull();
  });

  it('returns to the premiere and clears the hash', async () => {
    window.history.replaceState(null, '', '/#event-night');
    render(<DemoHost />);
    expect(screen.getByTestId('demo-host__event-night')).toBeDefined();
    await userEvent.click(screen.getByTestId('demo-host__event-night'));
    expect(window.location.hash).toBe('');
    expect(screen.getByTestId('demo-host__premiere')).toBeDefined();
  });
});
