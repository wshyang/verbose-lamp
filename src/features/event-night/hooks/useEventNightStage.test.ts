// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEventNightStage } from './useEventNightStage';

const mocks = vi.hoisted(() => ({
  isReady: true,
  preview: { toggleFireworks: vi.fn(), toggleSearchlights: vi.fn() },
  navItems: [{ id: 'foyer', label: 'Foyer' }],
  night: { tagline: 'Dinner is served' },
  ambient: null as null | { isReady: boolean; start: () => void },
  useEventNight: vi.fn(),
}));

vi.mock('@/features/spectacle', () => ({ useSpectacle: () => ({ isReady: mocks.isReady }) }));
vi.mock('@/features/spectacle-preview', () => ({ useSpectaclePreview: () => mocks.preview }));
vi.mock('./useGoldUiLines', () => ({ useGoldUiLines: () => ({ navItems: mocks.navItems }) }));
vi.mock('./useLatticeControls', () => ({ useLatticeControls: () => ({ latticeSeed: 7 }) }));
vi.mock('./useEventNight', () => ({
  useEventNight: (items: unknown) => {
    mocks.useEventNight(items);
    return mocks.night;
  },
}));
vi.mock('./useAmbientShow', () => ({
  useAmbientShow: (options: { isReady: boolean; start: () => void }) => {
    mocks.ambient = options;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ambient = null;
  mocks.isReady = true;
});

describe('useEventNightStage', () => {
  it('hands back the console, the two screen-only controls and the night behaviour', () => {
    const { result } = renderHook(() => useEventNightStage());

    expect(result.current.preview).toBe(mocks.preview);
    expect(result.current.gold.navItems).toBe(mocks.navItems);
    expect(result.current.lattice.latticeSeed).toBe(7);
    expect(result.current.night).toBe(mocks.night);
  });

  it('builds the night behaviour from the edited nav items, not the console', () => {
    renderHook(() => useEventNightStage());

    expect(mocks.useEventNight).toHaveBeenCalledWith(mocks.navItems);
  });

  it('starts the ambient show with fireworks and searchlights once the stage is ready', () => {
    renderHook(() => useEventNightStage());

    expect(mocks.ambient?.isReady).toBe(true);
    mocks.ambient?.start();
    expect(mocks.preview.toggleFireworks).toHaveBeenCalledTimes(1);
    expect(mocks.preview.toggleSearchlights).toHaveBeenCalledTimes(1);
  });

  it('tells the ambient show when the stage is not ready yet', () => {
    mocks.isReady = false;

    renderHook(() => useEventNightStage());

    expect(mocks.ambient?.isReady).toBe(false);
  });
});
