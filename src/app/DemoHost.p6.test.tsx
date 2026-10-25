// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { render, screen } from '@testing-library/react';

import userEvent from '@testing-library/user-event';

import { DemoHost } from './DemoHost';

import { setupDomTests } from '@/test/dom';

import { App } from '../App';

vi.mock('./GatsbyPremiere', () => ({
  GatsbyPremiere: ({ onOpenEventNight }: { onOpenEventNight: () => void }) => (
    <button type="button" data-testid="demo__premiere" onClick={onOpenEventNight}>
      premiere
    </button>
  ),
}));
vi.mock('@/features/event-night', () => ({
  EventNightScreen: ({ onExit }: { onExit: () => void }) => (
    <button type="button" data-testid="demo__event-night" onClick={onExit}>
      event night
    </button>
  ),
}));
setupDomTests();
beforeEach(() => {
  window.history.replaceState({}, '', '/');
});
describe('DemoHost', () => {
  it('mounts the premiere by default, and only the premiere', () => {
    render(<DemoHost />);

    expect(screen.getByTestId('demo__premiere')).toBeTruthy();
    expect(screen.queryByTestId('demo__event-night')).toBeNull();
  });

  it('swaps to event night and back through the hash', async () => {
    render(<DemoHost />);

    await userEvent.click(screen.getByTestId('demo__premiere'));
    expect(window.location.hash).toBe('#event-night');
    expect(screen.getByTestId('demo__event-night')).toBeTruthy();
    expect(screen.queryByTestId('demo__premiere')).toBeNull();

    await userEvent.click(screen.getByTestId('demo__event-night'));
    expect(window.location.hash).toBe('');
    expect(screen.getByTestId('demo__premiere')).toBeTruthy();
  });

  it('opens straight into event night for a deep link', () => {
    window.history.replaceState({}, '', '/#event-night');
    render(<DemoHost />);

    expect(screen.getByTestId('demo__event-night')).toBeTruthy();
  });
});
describe('App', () => {
  it('renders the demo host', () => {
    render(<App />);
    expect(screen.getByTestId('demo__premiere')).toBeTruthy();
  });
});
