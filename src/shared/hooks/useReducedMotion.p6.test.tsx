// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { act, render, screen } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';

import { useReducedMotion } from './useReducedMotion';

import { setupDomTests } from '@/test/dom';

setupDomTests();
type Listener_p6 = () => void;
function installMatchMedia(matches: boolean) {
  const listeners = new Set<Listener_p6>();
  const mq = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: (_: string, listener: Listener_p6) => listeners.add(listener),
    removeEventListener: (_: string, listener: Listener_p6) => listeners.delete(listener),
  };
  const matchMedia = vi.fn(() => mq);
  vi.stubGlobal('matchMedia', matchMedia);
  window.matchMedia = matchMedia as unknown as typeof window.matchMedia;
  return {
    mq,
    matchMedia,
    listeners,
    emit(next: boolean) {
      mq.matches = next;
      for (const listener of [...listeners]) listener();
    },
  };
}
function Probe() {
  const reduced = useReducedMotion();
  return <span data-testid="reduced">{String(reduced)}</span>;
}
describe('useReducedMotion', () => {
  it('reads the initial preference from matchMedia', () => {
    installMatchMedia(true);
    render(<Probe />);
    expect(screen.getByTestId('reduced').textContent).toBe('true');
  });

  it('subscribes to changes and unsubscribes on unmount', async () => {
    const media = installMatchMedia(false);
    const { unmount } = render(<Probe />);
    expect(screen.getByTestId('reduced').textContent).toBe('false');
    expect(media.listeners.size).toBe(1);

    act(() => media.emit(true));
    expect(screen.getByTestId('reduced').textContent).toBe('true');

    unmount();
    expect(media.listeners.size).toBe(0);
  });

  it('uses the standard query', () => {
    const media = installMatchMedia(false);
    render(<Probe />);
    expect(media.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });
});
