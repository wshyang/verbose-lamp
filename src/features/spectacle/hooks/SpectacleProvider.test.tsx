// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SpectacleProvider, useSpectacle } from './SpectacleProvider';

const stage = vi.hoisted(() => ({
  play: vi.fn(() => ({ finished: Promise.resolve(), stop: vi.fn() })),
  stopAll: vi.fn(),
  setReducedMotion: vi.fn(),
  dispose: vi.fn(),
  qualityTier: 'high' as const,
  onAnnounce: null as null | ((text: string) => void),
}));

vi.mock('../engine/createSpectacleStage', () => ({
  createSpectacleStage: (options: { onAnnounce?: (text: string) => void }) => {
    stage.onAnnounce = options.onAnnounce ?? null;
    return {
      play: stage.play,
      stopAll: stage.stopAll,
      setReducedMotion: stage.setReducedMotion,
      dispose: stage.dispose,
      qualityTier: stage.qualityTier,
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
    expect(stage.dispose).toHaveBeenCalledTimes(1);
  });

  it('forwards play and stop to the stage and announces results', async () => {
    render(
      <SpectacleProvider>
        <Probe />
      </SpectacleProvider>,
    );
    await userEvent.click(screen.getByTestId('probe__play'));
    expect(stage.play).toHaveBeenCalledWith('confetti', expect.objectContaining({ mode: 'burst' }));
    await userEvent.click(screen.getByTestId('probe__stop'));
    expect(stage.stopAll).toHaveBeenCalled();

    act(() => stage.onAnnounce?.('Daisy Buchanan wins'));
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
    expect(stage.setReducedMotion).toHaveBeenLastCalledWith(true);
  });

  it('throws a clear error when a component asks outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useSpectacle must be used inside SpectacleProvider');
    spy.mockRestore();
  });
});
