// @vitest-environment jsdom
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { DemoHost } from './DemoHost';
import { useDemoScreen } from './hooks/useDemoScreen';
import { parseDemoScreen } from './model/demoScreen';

vi.mock('@/features/event-night', () => ({
  EventNightScreen: ({ onExit }: { onExit: () => void }) => (
    <button type="button" onClick={onExit}>Event night mock</button>
  ),
}));
vi.mock('./GatsbyPremiere', () => ({
  GatsbyPremiere: ({ onOpenEventNight }: { onOpenEventNight: () => void }) => (
    <button type="button" onClick={onOpenEventNight}>Premiere mock</button>
  ),
}));

beforeEach(() => window.history.replaceState(null, '', '/?act=2'));

describe('demo routing', () => {
  it('parses only the event-night hash, case-insensitively', () => {
    expect(parseDemoScreen('#EVENT-NIGHT')).toBe('event-night');
    expect(parseDemoScreen('#premiere')).toBe('premiere');
    expect(parseDemoScreen('')).toBe('premiere');
  });

  it('starts on Event Night from the hash and follows popstate until cleanup', () => {
    window.history.replaceState(null, '', '/#event-night');
    const { result, unmount } = renderHook(() => useDemoScreen());
    expect(result.current.screen).toBe('event-night');
    window.history.replaceState(null, '', '/');
    act(() => window.dispatchEvent(new PopStateEvent('popstate')));
    expect(result.current.screen).toBe('premiere');
    unmount();
    window.history.replaceState(null, '', '/#event-night');
    act(() => window.dispatchEvent(new PopStateEvent('popstate')));
    expect(result.current.screen).toBe('premiere');
  });

  it('renders the App shell through DemoHost', () => {
    render(<App />);
    expect(screen.getByText('Premiere mock')).toBeTruthy();
  });

  it('mounts one demo at a time and writes navigation to history', async () => {
    const user = userEvent.setup();
    render(<DemoHost />);
    await user.click(screen.getByText('Premiere mock'));
    expect(window.location.hash).toBe('#event-night');
    expect(screen.getByText('Event night mock')).toBeTruthy();
    await user.click(screen.getByText('Event night mock'));
    expect(window.location.hash).toBe('');
    expect(window.location.search).toBe('?act=2');
    expect(screen.getByText('Premiere mock')).toBeTruthy();
  });
});
