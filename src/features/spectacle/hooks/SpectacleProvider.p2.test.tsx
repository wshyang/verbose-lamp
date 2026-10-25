// @vitest-environment jsdom
// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { act, render, renderHook, screen } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SpectacleProvider, useSpectacle } from './SpectacleProvider';

const mocks = vi.hoisted(() => ({
  systemReduced: false,
  stageOptions: [] as Array<{ reducedMotion: boolean; onAnnounce: (text: string) => void }>,
  play: vi.fn(),
  stopAll: vi.fn(),
}));
vi.mock('@/shared/hooks/useReducedMotion', () => ({ useReducedMotion: () => mocks.systemReduced }));
vi.mock('./useSpectacleStage', () => ({
  useSpectacleStage: (options: { reducedMotion: boolean; onAnnounce: (text: string) => void }) => {
    mocks.stageOptions.push(options);
    return { play: mocks.play, stopAll: mocks.stopAll, qualityTier: 'high', isReady: true };
  },
}));
type Api = ReturnType<typeof useSpectacle>;
let latestApi: Api | undefined;
function Consumer() {
  latestApi = useSpectacle();
  return <p>{latestApi.reducedMotion ? 'reduced' : 'full'}</p>;
}
beforeEach(() => {
  mocks.systemReduced = false;
  mocks.stageOptions = [];
  latestApi = undefined;
});
describe('SpectacleProvider', () => {
  it('publishes the stage API, simulated reduced motion, and announcements', () => {
    render(
      <SpectacleProvider className="custom-host">
        <Consumer />
      </SpectacleProvider>
    );
    expect(screen.getByTestId('spectacle-layer__host').className).toBe('custom-host');
    expect(latestApi).toMatchObject({ qualityTier: 'high', isReady: true, reducedMotion: false });
    act(() => latestApi?.setSimulatedReducedMotion(true));
    expect(latestApi).toMatchObject({ reducedMotion: true, simulatedReducedMotion: true });
    expect(screen.getByText('reduced')).toBeTruthy();
    act(() => mocks.stageOptions.at(-1)?.onAnnounce('Winner announced'));
    expect(screen.getByRole('status').textContent).toBe('Winner announced');
  });

  it('system reduced motion wins without simulation', () => {
    mocks.systemReduced = true;
    render(
      <SpectacleProvider>
        <Consumer />
      </SpectacleProvider>
    );
    expect(latestApi).toMatchObject({ reducedMotion: true, simulatedReducedMotion: false });
    expect(screen.getByTestId('spectacle-layer__host').className).toContain('relative');
  });

  it('throws a useful error outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useSpectacle())).toThrow('useSpectacle must be used inside SpectacleProvider');
  });
});
