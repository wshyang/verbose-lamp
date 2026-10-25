// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// The stage's own wiring is under test, not the engine: the spectacle provider, the console
// state and the lucky-draw dialog are doubled so each overlay can be switched on directly.
const state = vi.hoisted(() => ({
  preview: {} as Record<string, unknown>,
}));

vi.mock('@/features/spectacle', () => ({ useSpectacle: () => ({ isReady: true }) }));
vi.mock('@/features/lucky-draw', () => ({ LuckyDrawStage: () => <div data-testid="draw-double" /> }));
vi.mock('@/features/gilded-ui', () => ({ GildedNavBar: () => <nav data-testid="nav-double" /> }));
vi.mock('@/features/spectacle-preview', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/spectacle-preview')>()),
  useSpectaclePreview: () => state.preview,
  SpectaclePreviewLauncher: () => <span data-testid="launcher-double" />,
  SpectaclePreviewPanel: () => <aside data-testid="panel-double" />,
}));
vi.mock('../hooks/useAmbientShow', () => ({ useAmbientShow: () => undefined }));
vi.mock('../hooks/useEventNight', () => ({
  useEventNight: () => ({
    navRef: { current: null }, activeId: 'foyer', selectNav: vi.fn(), isDrawOpen: false,
    openDraw: vi.fn(), closeDraw: vi.fn(), handleLanded: vi.fn(), tagline: 'A tagline', exit: vi.fn(),
  }),
}));
vi.mock('./TitleMedallion', () => ({ TitleMedallion: () => <div data-testid="medallion-double" /> }));

import { EventNightStage } from './EventNightStage';

function show(overrides: Record<string, unknown>) {
  state.preview = {
    open: false, picking: false, keepClearOn: false, origin: { x: 0.5, y: 0.42 },
    speaker: { x: 0.42, y: 0.28, w: 0.16, h: 0.24 }, moveSpeaker: vi.fn(), onStageClick: vi.fn(),
    marqueeOn: true, navItems: [], latticeSeed: 1, latticeDensity: 0.5, latticeLevel: 3,
    toggleFireworks: vi.fn(), toggleSearchlights: vi.fn(),
    ...overrides,
  };
  return render(<EventNightStage onExit={vi.fn()} />);
}

// Event Night keeps its own test ids on the shared overlays so its e2e flows do not move.
describe('EventNightStage overlays', () => {
  it('shows none of them while the console is closed', () => {
    show({});

    expect(screen.queryByTestId('event-night__origin-crosshair')).toBeNull();
    expect(screen.queryByTestId('event-night__pick-hint')).toBeNull();
    expect(screen.queryByTestId('event-night__speaker')).toBeNull();
  });

  it('marks the origin under the Event Night test id once the console opens', () => {
    show({ open: true });

    expect(screen.getByTestId('event-night__origin-crosshair')).toBeTruthy();
    expect(screen.queryByTestId('spectacle-preview__crosshair')).toBeNull();
  });

  it('shows the pick hint only while picking', () => {
    show({ picking: true });

    expect(screen.getByTestId('event-night__pick-hint')).toBeTruthy();
  });

  it('shows the keep-clear speaker only when asked', () => {
    show({ keepClearOn: true });

    expect(screen.getByTestId('event-night__speaker')).toBeTruthy();
  });
});
