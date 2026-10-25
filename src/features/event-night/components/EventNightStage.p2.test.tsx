// @vitest-environment jsdom
// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventNightStage } from './EventNightStage';
import { EventNightScreen } from '../EventNightScreen';

const mocks = vi.hoisted(() => {
  const preview = {
    open: false, picking: false, keepClearOn: false,
    origin: { x: 0.1, y: 0.2 }, speaker: { x: 0, y: 0, w: 0.2, h: 0.2 },
    navItems: [{ id: 'one', emoji: '✦', label: 'One' }],
    latticeSeed: 4, latticeDensity: 0.7, latticeLevel: 3, marqueeOn: true,
    setOpen: vi.fn(), onStageClick: vi.fn(), moveSpeaker: vi.fn(),
    toggleFireworks: vi.fn(), toggleSearchlights: vi.fn(),
  };
  const night = {
    navRef: { current: null }, tagline: 'Tagline', isDrawOpen: false,
    openDraw: vi.fn(), closeDraw: vi.fn(), activeId: 'one', selectNav: vi.fn(), handleLanded: vi.fn(),
  };
  return { preview, night, ambient: [] as Array<{ isReady: boolean; start: () => void }> };
});
vi.mock('@/features/gilded-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/gilded-ui')>()),
  GildedGlyphDefs: () => <span>Glyphs</span>,
  GildedNavBar: () => <nav>Nav mock</nav>,
}));
vi.mock('@/features/lucky-draw', () => ({ LuckyDrawStage: () => <div>Draw mock</div> }));
vi.mock('@/features/spectacle', () => ({
  useSpectacle: () => ({ isReady: true }),
  SpectacleProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/features/spectacle-preview', () => ({
  useSpectaclePreview: () => mocks.preview,
  OriginCrosshair: () => <span>Crosshair mock</span>,
  PickOriginHint: () => <span>Hint mock</span>,
  KeepClearSpeaker: () => <span>Speaker mock</span>,
  SpectaclePreviewPanel: () => <aside>Panel mock</aside>,
  SpectaclePreviewLauncher: ({ open, onToggle }: { open: boolean; onToggle: () => void }) => (
    <button type="button" onClick={onToggle}>Launcher {String(open)}</button>
  ),
}));
vi.mock('../hooks/useAmbientShow', () => ({
  useAmbientShow: (options: { isReady: boolean; start: () => void }) => mocks.ambient.push(options),
}));
vi.mock('../hooks/useEventNight', () => ({ useEventNight: () => mocks.night }));
vi.mock('./EventNightHeader', () => ({
  EventNightHeader: ({ launcher }: { launcher: React.ReactNode }) => <header>{launcher}</header>,
}));
vi.mock('./StageBackdrop', () => ({ StageBackdrop: () => <span>Backdrop mock</span> }));
vi.mock('./TitleMedallion', () => ({ TitleMedallion: () => <span>Medallion mock</span> }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.preview.open = false;
  mocks.preview.picking = false;
  mocks.preview.keepClearOn = false;
  mocks.night.isDrawOpen = false;
  mocks.ambient = [];
});
describe('EventNightStage', () => {
  it('shows picking helpers and the draw only when enabled', () => {
    mocks.preview.open = true;
    mocks.preview.picking = true;
    mocks.preview.keepClearOn = true;
    mocks.night.isDrawOpen = true;
    render(<EventNightStage onExit={vi.fn()} />);
    expect(screen.getByText('Crosshair mock')).toBeTruthy();
    expect(screen.getByText('Hint mock')).toBeTruthy();
    expect(screen.getByText('Speaker mock')).toBeTruthy();
    expect(screen.getByText('Draw mock')).toBeTruthy();
  });
});
describe('EventNightScreen', () => {
  it('owns the spectacle provider and glyph definitions', () => {
    render(<EventNightScreen onExit={vi.fn()} />);
    expect(screen.getByTestId('event-night__screen')).toBeTruthy();
    expect(screen.getByText('Glyphs')).toBeTruthy();
    expect(screen.getByText('Medallion mock')).toBeTruthy();
  });
});
