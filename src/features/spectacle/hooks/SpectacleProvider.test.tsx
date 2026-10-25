// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { setupDomTests } from '@/test/dom';

setupDomTests();

/** The stage itself is covered by `useSpectacleStage.test.tsx`; here it is a stub API. */
const stage = vi.hoisted(() => ({
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
    stage.captured = options;
    return {
      play: stage.play,
      stopAll: stage.stopAll,
      qualityTier: stage.qualityTier,
      isReady: stage.isReady,
    };
  },
}));

vi.mock('@/shared/hooks/useReducedMotion', () => ({
  useReducedMotion: () => stage.systemReduced,
}));

import { SpectacleProvider, useSpectacle } from './SpectacleProvider';

/** Renders the API the provider hands to its children. */
function Consumer() {
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
  stage.captured = null;
  stage.systemReduced = false;
  stage.qualityTier = 'high';
  stage.isReady = true;
});

const mount = (props: { className?: string } = {}) =>
  render(
    <SpectacleProvider {...props}>
      <span>event night</span>
      <Consumer />
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
    expect(stage.play).toHaveBeenCalledWith('confetti', { mode: 'burst' });

    act(() => screen.getByText('stop').click());
    expect(stage.stopAll).toHaveBeenCalledTimes(1);
  });

  it('reports a stage that is not ready yet', () => {
    stage.isReady = false;
    stage.qualityTier = null;
    mount();

    expect(screen.getByTestId('ready').textContent).toBe('false');
    expect(screen.getByTestId('tier').textContent).toBe('null');
  });

  it('announces results through a single hidden live region', () => {
    mount();

    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('');

    act(() => stage.captured!.onAnnounce('Confetti'));

    expect(screen.getByRole('status').textContent).toBe('Confetti');
  });

  it('follows the system reduced-motion preference', () => {
    stage.systemReduced = true;
    mount();

    expect(screen.getByTestId('reduced').textContent).toBe('true');
    expect(stage.captured!.reducedMotion).toBe(true);
  });

  it('lets the demo simulate reduced motion on top of the system setting', () => {
    mount();

    act(() => screen.getByText('simulate').click());

    expect(screen.getByTestId('simulated').textContent).toBe('true');
    expect(screen.getByTestId('reduced').textContent).toBe('true');
    expect(stage.captured!.reducedMotion).toBe(true);
  });

  it('refuses to hand out the API outside a provider', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Consumer />)).toThrow(
      'useSpectacle must be used inside SpectacleProvider'
    );
    quiet.mockRestore();
  });
});
