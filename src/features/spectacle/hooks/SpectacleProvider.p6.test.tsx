// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { act, render, screen } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SpectacleProvider, useSpectacle } from './SpectacleProvider';

import { setupDomTests } from '@/test/dom';

setupDomTests();
/** The stage itself is covered by `useSpectacleStage.test.tsx`; here it is a stub API. */
const stage_p6 = vi.hoisted(() => ({
  play: vi.fn(),
  stopAll: vi.fn(),
  qualityTier: 'high' as 'high' | null,
  isReady: true,
  setReducedMotion: vi.fn(),
  systemReduced: false,
  captured: null as null | { reducedMotion: boolean; onAnnounce: (text: string) => void },
}));
vi.mock('./useSpectacleStage', () => ({
  useSpectacleStage: (options: {
    reducedMotion: boolean;
    onAnnounce: (text: string) => void;
  }) => {
    stage_p6.captured = options;
    return {
      play: stage_p6.play,
      stopAll: stage_p6.stopAll,
      qualityTier: stage_p6.qualityTier,
      isReady: stage_p6.isReady,
    };
  },
}));
vi.mock('@/shared/hooks/useReducedMotion', () => ({
  useReducedMotion: () => stage_p6.systemReduced,
}));
/** Renders the API the provider hands to its children. */
function Consumer_p6() {
  const api = useSpectacle();
  return (
    <div>
      <span data-testid="tier">{String(api.qualityTier)}</span>
      <span data-testid="ready">{String(api.isReady)}</span>
      <span data-testid="reduced">{String(api.reducedMotion)}</span>
      <span data-testid="simulated">{String(api.simulatedReducedMotion)}</span>
      <button type="button" onClick={() => api.setSimulatedReducedMotion(true)}>
        simulate
      </button>
      <button type="button" onClick={() => api.play('confetti', { mode: 'burst' })}>
        play
      </button>
      <button type="button" onClick={() => api.stopAll()}>
        stop
      </button>
    </div>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  stage_p6.captured = null;
  stage_p6.systemReduced = false;
  stage_p6.qualityTier = 'high';
  stage_p6.isReady = true;
});
const mount = (props: { className?: string } = {}) =>
  render(
    <SpectacleProvider {...props}>
      <span>event night</span>
      <Consumer_p6 />
    </SpectacleProvider>
  );
describe('SpectacleProvider', () => {
  it('mounts the stage host around the children', () => {
    mount();

    const host = screen.getByTestId('spectacle-layer__host');
    expect(host.contains(screen.getByText('event night'))).toBe(true);
    expect(host.className).toBe('relative min-h-screen overflow-hidden');
  });

  it('takes a custom host class', () => {
    mount({ className: 'fixed inset-0' });

    expect(screen.getByTestId('spectacle-layer__host').className).toBe('fixed inset-0');
  });

  it('exposes the stage API to children', () => {
    mount();

    expect(screen.getByTestId('tier').textContent).toBe('high');
    expect(screen.getByTestId('ready').textContent).toBe('true');
    expect(screen.getByTestId('reduced').textContent).toBe('false');

    act(() => screen.getByText('play').click());
    expect(stage_p6.play).toHaveBeenCalledWith('confetti', { mode: 'burst' });

    act(() => screen.getByText('stop').click());
    expect(stage_p6.stopAll).toHaveBeenCalledTimes(1);
  });

  it('reports a stage that is not ready yet', () => {
    stage_p6.isReady = false;
    stage_p6.qualityTier = null;
    mount();

    expect(screen.getByTestId('ready').textContent).toBe('false');
    expect(screen.getByTestId('tier').textContent).toBe('null');
  });

  it('announces results through a single hidden live region', () => {
    mount();

    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('');

    act(() => stage_p6.captured!.onAnnounce('Confetti'));

    expect(screen.getByRole('status').textContent).toBe('Confetti');
  });

  it('follows the system reduced-motion preference', () => {
    stage_p6.systemReduced = true;
    mount();

    expect(screen.getByTestId('reduced').textContent).toBe('true');
    expect(stage_p6.captured!.reducedMotion).toBe(true);
  });

  it('lets the demo simulate reduced motion on top of the system setting', () => {
    mount();

    act(() => screen.getByText('simulate').click());

    expect(screen.getByTestId('simulated').textContent).toBe('true');
    expect(screen.getByTestId('reduced').textContent).toBe('true');
    expect(stage_p6.captured!.reducedMotion).toBe(true);
  });

  it('refuses to hand out the API outside a provider', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Consumer_p6 />)).toThrow(
      'useSpectacle must be used inside SpectacleProvider'
    );
    quiet.mockRestore();
  });
});
