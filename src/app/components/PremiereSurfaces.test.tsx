// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupDomTests } from '@/test/dom';

const state = vi.hoisted(() => ({
  shortcuts: [] as Array<Record<string, unknown>>,
  panelOpen: false,
  drawOpen: false,
  setOpen: vi.fn(),
  openDraw: vi.fn(),
  closeDraw: vi.fn(),
  handleLanded: vi.fn(),
  onStageClick: vi.fn(() => false),
}));

vi.mock('@/features/spectacle', () => ({
  SpectacleProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="spectacle__provider">{children}</div>
  ),
}));

vi.mock('@/features/premiere', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/premiere')>();
  return {
    ...actual,
    usePremiereController: () => ({
      stageRef: { current: null },
      currentTime: 12,
      activeAct: 1,
      isPlaying: true,
      cameraMode: 'cinema',
      nitrateMode: false,
      soundOn: false,
      heroConfig: actual.DEFAULT_HERO_TITLE,
      currentChapter: actual.SEQUENCE_CHAPTERS[1] ?? actual.SEQUENCE_CHAPTERS[0],
      frameStudio: {},
      togglePlayback: vi.fn(),
      replay: vi.fn(),
      scrub: vi.fn(),
      selectAct: vi.fn(),
      toggleCameraMode: vi.fn(),
      toggleNitrateMode: vi.fn(),
      toggleSound: vi.fn(),
      applyHeroTitle: vi.fn(),
    }),
    usePremiereShortcuts: (options: Record<string, unknown>) => {
      state.shortcuts.push(options);
    },
  };
});

vi.mock('../hooks/usePremiereSpectacle', async () => {
  const { stubPreview } = await import('@/features/spectacle-preview/testing/stubPreview');
  return {
    usePremiereSpectacle: () => ({
      preview: stubPreview({ open: state.panelOpen, setOpen: state.setOpen, onStageClick: state.onStageClick }),
      isDrawOpen: state.drawOpen,
      openDraw: state.openDraw,
      closeDraw: state.closeDraw,
      handleLanded: state.handleLanded,
    }),
  };
});

vi.mock('@/features/lucky-draw', () => ({
  LuckyDrawStage: ({ onClose }: { onClose: () => void }) => (
    <button type="button" data-testid="lucky-draw__stage" onClick={onClose}>
      drum
    </button>
  ),
}));

vi.mock('./CinematicStage', () => ({
  CinematicStage: ({ hudHidden }: { hudHidden: boolean }) => (
    <div data-testid="cinematic-stage__stub" data-hud-hidden={String(hudHidden)} />
  ),
}));

vi.mock('./FrameStudioDock', () => ({
  FrameStudioDock: ({ hudHidden }: { hudHidden: boolean }) => (
    <div data-testid="frame-studio__dock" data-hud-hidden={String(hudHidden)} />
  ),
}));

const { PremiereSurfaces } = await import('./PremiereSurfaces');
const { GatsbyPremiere } = await import('../GatsbyPremiere');

setupDomTests();

beforeEach(() => {
  state.shortcuts.length = 0;
  state.panelOpen = false;
  state.drawOpen = false;
  state.setOpen.mockClear();
  state.openDraw.mockClear();
  state.onStageClick.mockClear();
});

describe('PremiereSurfaces', () => {
  it('mounts the stage, header, studio dock and timeline', () => {
    render(<PremiereSurfaces onOpenEventNight={vi.fn()} />);

    expect(screen.getByTestId('cinematic-stage__stub')).toBeTruthy();
    expect(screen.getByTestId('premiere-header__research')).toBeTruthy();
    expect(screen.getByTestId('frame-studio__dock')).toBeTruthy();
    expect(screen.getByTestId('timeline__play-toggle')).toBeTruthy();
  });

  it('wraps the premiere in one spectacle stage', () => {
    render(<GatsbyPremiere onOpenEventNight={vi.fn()} />);

    const provider = screen.getByTestId('spectacle__provider');
    expect(provider.querySelector('[data-testid="cinematic-stage__stub"]')).toBeTruthy();
  });

  it('offers the spectacle console from the header', async () => {
    render(<PremiereSurfaces onOpenEventNight={vi.fn()} />);

    const launcher = screen.getByTestId('spectacle-preview__launch');
    expect(launcher.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('spectacle-preview__panel')).toBeNull();

    await userEvent.click(launcher);
    expect(state.setOpen).toHaveBeenCalledWith(true);
  });

  it('docks the panel when the console is open', () => {
    state.panelOpen = true;
    render(<PremiereSurfaces onOpenEventNight={vi.fn()} />);

    expect(screen.getByTestId('spectacle-preview__panel')).toBeTruthy();
    expect(screen.getByTestId('spectacle-preview__launch').getAttribute('aria-expanded')).toBe('true');
  });

  it('shows the lucky-draw dialog only when the console opens it', () => {
    const { rerender } = render(<PremiereSurfaces onOpenEventNight={vi.fn()} />);
    expect(screen.queryByTestId('lucky-draw__stage')).toBeNull();

    state.drawOpen = true;
    rerender(<PremiereSurfaces onOpenEventNight={vi.fn()} />);
    expect(screen.getByTestId('lucky-draw__stage')).toBeTruthy();
  });

  it('forwards stage clicks so the console can pick an origin', async () => {
    render(<PremiereSurfaces onOpenEventNight={vi.fn()} />);

    await userEvent.click(screen.getByTestId('cinematic-stage__stub'));

    expect(state.onStageClick).toHaveBeenCalledTimes(1);
  });

  it('blocks keyboard shortcuts while a modal is open', async () => {
    render(<PremiereSurfaces onOpenEventNight={vi.fn()} />);
    expect(state.shortcuts.at(-1)?.isDialogOpen).toBe(false);

    await userEvent.click(screen.getByTestId('premiere-header__research'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(state.shortcuts.at(-1)?.isDialogOpen).toBe(true);
  });

  it('closes the research dialog again, releasing the shortcuts', async () => {
    render(<PremiereSurfaces onOpenEventNight={vi.fn()} />);

    await userEvent.click(screen.getByTestId('premiere-header__research'));
    expect(state.shortcuts.at(-1)?.isDialogOpen).toBe(true);

    // The research dialog has its own close button and does not listen for Escape.
    await userEvent.click(screen.getByTestId('research-dialog__close'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(state.shortcuts.at(-1)?.isDialogOpen).toBe(false);
  });

  it('opens the title customizer from the header and closes it again', async () => {
    render(<PremiereSurfaces onOpenEventNight={vi.fn()} />);

    await userEvent.click(screen.getByTestId('premiere-header__customize'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(state.shortcuts.at(-1)?.isDialogOpen).toBe(true);

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(state.shortcuts.at(-1)?.isDialogOpen).toBe(false);
  });

  it('hides the HUD from the floating toggle', async () => {
    render(<PremiereSurfaces onOpenEventNight={vi.fn()} />);

    await userEvent.click(screen.getByTestId('premiere-hud__toggle'));

    expect(screen.getByTestId('cinematic-stage__stub').getAttribute('data-hud-hidden')).toBe('true');
    expect(screen.getByTestId('frame-studio__dock').getAttribute('data-hud-hidden')).toBe('true');
  });
});
