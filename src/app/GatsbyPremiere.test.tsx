// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GatsbyPremiere } from './GatsbyPremiere';

const mocks = vi.hoisted(() => {
  const preview = {
    open: false, picking: false, keepClearOn: false,
    origin: { x: 0.5, y: 0.5 }, speaker: { x: 0, y: 0, w: 1, h: 1 },
    onStageClick: vi.fn(), moveSpeaker: vi.fn(),
  };
  const spectacle = {
    preview, isDrawOpen: false, togglePanel: vi.fn(), openDraw: vi.fn(),
    closeDraw: vi.fn(), handleLanded: vi.fn(),
  };
  const premiere = {
    sceneStore: {}, cameraMode: 'cinema', nitrateMode: false, soundOn: false,
    currentChapter: {}, heroConfig: {}, activeAct: 0, currentTime: 0, isPlaying: true,
    frameStudio: {}, togglePlayback: vi.fn(), selectAct: vi.fn(), toggleCameraMode: vi.fn(),
    toggleNitrateMode: vi.fn(), toggleSound: vi.fn(), applyHeroTitle: vi.fn(),
    replay: vi.fn(), scrub: vi.fn(),
  };
  return { preview, spectacle, premiere, shortcutOptions: [] as Array<{ isDialogOpen: boolean }> };
});

vi.mock('@/features/gilded-ui', () => ({ GildedGlyphDefs: () => <span>Glyph defs</span> }));
vi.mock('@/features/lucky-draw', () => ({
  LuckyDrawStage: ({ onClose }: { onClose: () => void }) => (
    <button type="button" onClick={onClose}>Draw mock</button>
  ),
}));
vi.mock('@/features/spectacle', () => ({
  SpectacleProvider: ({ children, className }: { children: ReactNode; className?: string }) => (
    <section className={className}>{children}</section>
  ),
}));
vi.mock('@/features/spectacle-preview', () => ({
  OriginCrosshair: () => <span>Crosshair mock</span>,
  PickOriginHint: () => <span>Hint mock</span>,
  KeepClearSpeaker: () => <span>Speaker mock</span>,
  SpectaclePreviewPanel: ({ onOpenDraw, placement }: { onOpenDraw: () => void; placement?: string }) => (
    <button type="button" onClick={onOpenDraw}>Panel {placement}</button>
  ),
}));
vi.mock('@/features/title-customizer', () => ({
  CustomTitleModal: ({ open, onClose }: { open: boolean; onClose: () => void }) => (
    open ? <button type="button" onClick={onClose}>Close customizer</button> : null
  ),
}));
vi.mock('@/features/research', () => ({
  ResearchModal: ({ open, onClose }: { open: boolean; onClose: () => void }) => (
    open ? <button type="button" onClick={onClose}>Close research</button> : null
  ),
}));
vi.mock('@/features/premiere', () => ({
  SEQUENCE_CHAPTERS: [],
  TOTAL_SEQUENCE_DURATION: 38,
  usePremiereController: () => mocks.premiere,
  usePremiereShortcuts: (options: { isDialogOpen: boolean }) => mocks.shortcutOptions.push(options),
}));
vi.mock('./hooks/usePremiereSpectacle', () => ({ usePremiereSpectacle: () => mocks.spectacle }));
vi.mock('./components/CinematicStage', () => ({ CinematicStage: () => <span>Stage mock</span> }));
vi.mock('./components/FrameStudioDock', () => ({ FrameStudioDock: () => <span>Dock mock</span> }));
vi.mock('./components/OrbitHint', () => ({
  OrbitHint: ({ isVisible }: { isVisible: boolean }) => <span>Orbit visible {String(isVisible)}</span>,
}));
vi.mock('./components/PremiereTimeline', () => ({ PremiereTimeline: () => <span>Timeline mock</span> }));
vi.mock('./components/PremiereHeader', () => ({
  PremiereHeader: (props: { onOpenResearch: () => void; onOpenCustomizer: () => void; onOpenEventNight: () => void }) => (
    <>
      <button type="button" onClick={props.onOpenResearch}>Open research</button>
      <button type="button" onClick={props.onOpenCustomizer}>Open customizer</button>
      <button type="button" onClick={props.onOpenEventNight}>Open event</button>
    </>
  ),
}));
vi.mock('./components/FloatingHudToggle', () => ({
  FloatingHudToggle: ({ onToggle }: { onToggle: () => void }) => (
    <button type="button" onClick={onToggle}>Toggle HUD</button>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.preview.open = false;
  mocks.preview.picking = false;
  mocks.preview.keepClearOn = false;
  mocks.spectacle.isDrawOpen = false;
  mocks.premiere.cameraMode = 'cinema';
  mocks.shortcutOptions = [];
});

describe('GatsbyPremiere composition', () => {
  it('wires stage clicks, dialogs, HUD, spectacle helpers, and the lucky draw', async () => {
    const user = userEvent.setup();
    const onOpenEventNight = vi.fn();
    render(<GatsbyPremiere onOpenEventNight={onOpenEventNight} />);
    expect(screen.getByText('Glyph defs')).toBeTruthy();
    expect(screen.getByText('Panel left')).toBeTruthy();
    fireEvent.click(screen.getByRole('main'), { clientX: 12, clientY: 34 });
    expect(mocks.preview.onStageClick).toHaveBeenCalledWith(12, 34);

    await user.click(screen.getByText('Open event'));
    expect(onOpenEventNight).toHaveBeenCalledOnce();
    await user.click(screen.getByText('Open research'));
    expect(mocks.shortcutOptions.at(-1)?.isDialogOpen).toBe(true);
    await user.click(screen.getByText('Close research'));
    expect(mocks.shortcutOptions.at(-1)?.isDialogOpen).toBe(false);
    await user.click(screen.getByText('Open customizer'));
    await user.click(screen.getByText('Close customizer'));

    mocks.premiere.cameraMode = 'orbit';
    mocks.preview.open = true;
    mocks.preview.picking = true;
    mocks.preview.keepClearOn = true;
    mocks.spectacle.isDrawOpen = true;
    await user.click(screen.getByText('Toggle HUD'));
    expect(screen.getByText('Orbit visible false')).toBeTruthy();
    expect(screen.getByText('Crosshair mock')).toBeTruthy();
    expect(screen.getByText('Hint mock')).toBeTruthy();
    expect(screen.getByText('Speaker mock')).toBeTruthy();
    expect(screen.getByText('Draw mock')).toBeTruthy();
    await user.click(screen.getByText('Toggle HUD'));
    expect(screen.getByText('Orbit visible true')).toBeTruthy();
  });
});
