// @vitest-environment jsdom
// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { act, render, screen } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';

import { SpectacleProvider, useSpectacle } from './SpectacleProvider';

import userEvent from '@testing-library/user-event';

const stage_p3 = vi.hoisted(() => ({
  play: vi.fn(() => ({ finished: Promise.resolve(), stop: vi.fn() })),
  stopAll: vi.fn(),
  setReducedMotion: vi.fn(),
  dispose: vi.fn(),
  qualityTier: 'high' as const,
  onAnnounce: null as null | ((text: string) => void),
}));
vi.mock('../engine/createSpectacleStage', () => ({
  createSpectacleStage: (options: { onAnnounce?: (text: string) => void }) => {
    stage_p3.onAnnounce = options.onAnnounce ?? null;
    return {
      play: stage_p3.play,
      stopAll: stage_p3.stopAll,
      setReducedMotion: stage_p3.setReducedMotion,
      dispose: stage_p3.dispose,
      qualityTier: stage_p3.qualityTier,
    };
  },
}));
function Probe() {
  const { play, stopAll, qualityTier, isReady, reducedMotion, setSimulatedReducedMotion } =
    useSpectacle();
  return (
    <div>
      <span data-testid="probe__tier">{qualityTier ?? 'none'}</span>
      <span data-testid="probe__ready">{String(isReady)}</span>
      <span data-testid="probe__reduced">{String(reducedMotion)}</span>
      <button
        type="button"
        data-testid="probe__play"
        onClick={() => play('confetti', { mode: 'burst', origin: { x: 0.5, y: 0.5 }, seed: 1 })}
      >
        play
      </button>
      <button type="button" data-testid="probe__stop" onClick={stopAll}>
        stop
      </button>
      <button
        type="button"
        data-testid="probe__reduce"
        onClick={() => setSimulatedReducedMotion(true)}
      >
        reduce
      </button>
    </div>
  );
}
describe('SpectacleProvider', () => {
  it('mounts one stage, exposes the typed API and disposes on unmount', () => {
    const { unmount } = render(
      <SpectacleProvider className="host">
        <Probe />
      </SpectacleProvider>,
    );
    expect(screen.getByTestId('spectacle-layer__host').className).toBe('host');
    expect(screen.getByTestId('probe__tier').textContent).toBe('high');
    expect(screen.getByTestId('probe__ready').textContent).toBe('true');
    unmount();
    expect(stage_p3.dispose).toHaveBeenCalledTimes(1);
  });

  it('forwards play and stop to the stage and announces results', async () => {
    render(
      <SpectacleProvider>
        <Probe />
      </SpectacleProvider>,
    );
    await userEvent.click(screen.getByTestId('probe__play'));
    expect(stage_p3.play).toHaveBeenCalledWith('confetti', expect.objectContaining({ mode: 'burst' }));
    await userEvent.click(screen.getByTestId('probe__stop'));
    expect(stage_p3.stopAll).toHaveBeenCalled();

    act(() => stage_p3.onAnnounce?.('Daisy Buchanan wins'));
    expect(screen.getByRole('status').textContent).toBe('Daisy Buchanan wins');
  });

  it('keeps the stage in sync with simulated reduced motion', async () => {
    render(
      <SpectacleProvider>
        <Probe />
      </SpectacleProvider>,
    );
    expect(screen.getByTestId('probe__reduced').textContent).toBe('false');
    await userEvent.click(screen.getByTestId('probe__reduce'));
    expect(screen.getByTestId('probe__reduced').textContent).toBe('true');
    expect(stage_p3.setReducedMotion).toHaveBeenLastCalledWith(true);
  });

  it('throws a clear error when a component asks outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useSpectacle must be used inside SpectacleProvider');
    spy.mockRestore();
  });
});
