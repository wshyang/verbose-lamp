// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_HERO_TITLE, SEQUENCE_CHAPTERS } from '@/features/premiere';
import { GatsbyPremiere } from './GatsbyPremiere';

const controllerState = vi.hoisted(() => ({ cameraMode: 'cinema' as 'cinema' | 'orbit' }));

const controller = vi.hoisted(() => ({
  applyHeroTitle: vi.fn(),
  togglePlayback: vi.fn(),
  selectAct: vi.fn(),
  replay: vi.fn(),
  scrub: vi.fn(),
  toggleCameraMode: vi.fn(),
  toggleNitrateMode: vi.fn(),
  toggleSound: vi.fn(),
}));

vi.mock('@/features/premiere', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/features/premiere')>();
  return {
    ...original,
    usePremiereController: () => ({
      ...controller,
      stageRef: { current: null },
      currentTime: 3,
      activeAct: 1,
      isPlaying: true,
      cameraMode: controllerState.cameraMode,
      nitrateMode: false,
      soundOn: false,
      heroConfig: original.DEFAULT_HERO_TITLE,
      currentChapter: original.SEQUENCE_CHAPTERS[1],
      frameStudio: {
        isOpen: false,
        surface: 'title-cards',
        reveal: vi.fn(),
        dismiss: vi.fn(),
      },
    }),
  };
});

async function waitForDialogFocus() {
  await waitFor(() => {
    expect(document.activeElement?.closest('[role="dialog"]')).not.toBeNull();
  });
}

describe('GatsbyPremiere', () => {
  it('mounts the premiere inside a spectacle stage', () => {
    render(<GatsbyPremiere onOpenEventNight={vi.fn()} />);
    expect(screen.getByTestId('spectacle-layer__host')).toBeDefined();
    expect(screen.getByTestId('cinematic-stage__canvas')).toBeDefined();
    expect(screen.getAllByTestId('timeline__chapter')).toHaveLength(SEQUENCE_CHAPTERS.length);
    expect(screen.getAllByTestId('timeline__chapter')[4].textContent).toContain(
      DEFAULT_HERO_TITLE.mainTitle,
    );
  });

  it('opens and closes the small spectacle overlay from the header button', async () => {
    render(<GatsbyPremiere onOpenEventNight={vi.fn()} />);
    const launcher = screen.getByTestId('spectacle-preview__launch');
    expect(launcher.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('spectacle-preview__panel')).toBeNull();

    await userEvent.click(launcher);
    expect(launcher.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('spectacle-preview__panel')).toBeDefined();

    await userEvent.click(screen.getByTestId('spectacle-preview__close'));
    expect(screen.queryByTestId('spectacle-preview__panel')).toBeNull();
  });

  it('opens the lucky draw from the spectacle panel', async () => {
    render(<GatsbyPremiere onOpenEventNight={vi.fn()} />);
    await userEvent.click(screen.getByTestId('spectacle-preview__launch'));
    await userEvent.click(screen.getByTestId('spectacle-preview__lucky-draw'));
    expect(screen.getByTestId('lucky-draw__stage')).toBeDefined();
    await userEvent.click(screen.getByTestId('lucky-draw__close'));
    expect(screen.queryByTestId('lucky-draw__stage')).toBeNull();
  });

  it('toggles the HUD from the floating button and with the h shortcut', async () => {
    const { container } = render(<GatsbyPremiere onOpenEventNight={vi.fn()} />);
    const header = container.querySelector('header');
    expect(header?.className).toContain('opacity-100');

    await userEvent.click(screen.getByTestId('premiere-hud__toggle'));
    expect(container.querySelector('header')?.className).toContain('opacity-0');

    await userEvent.keyboard('h');
    expect(container.querySelector('header')?.className).toContain('opacity-100');
  });

  it('opens the research and customizer dialogs and closes them with Escape', async () => {
    render(<GatsbyPremiere onOpenEventNight={vi.fn()} />);
    await userEvent.click(screen.getByTestId('premiere-header__research'));
    expect(screen.getByRole('dialog')).toBeDefined();
    await waitForDialogFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.click(screen.getByTestId('premiere-header__customize'));
    expect(screen.getByRole('dialog')).toBeDefined();
    await waitForDialogFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the orbit hint when the camera leaves cinema mode', () => {
    controllerState.cameraMode = 'orbit';
    try {
      render(<GatsbyPremiere onOpenEventNight={vi.fn()} />);
      expect(screen.getByText(/Drag to Orbit/)).toBeDefined();
    } finally {
      controllerState.cameraMode = 'cinema';
    }
  });

  it('ignores the h shortcut while a dialog is open', async () => {
    const { container } = render(<GatsbyPremiere onOpenEventNight={vi.fn()} />);
    await userEvent.click(screen.getByTestId('premiere-header__research'));
    await userEvent.keyboard('h');
    expect(screen.queryByRole('dialog')).toBeDefined();
    expect(container.querySelector('header')?.className).toContain('opacity-100');
  });

  it('passes the host callback to the Event Night launcher', async () => {
    const onOpenEventNight = vi.fn();
    render(<GatsbyPremiere onOpenEventNight={onOpenEventNight} />);
    await userEvent.click(screen.getByTestId('event-night__launch'));
    expect(onOpenEventNight).toHaveBeenCalledTimes(1);
  });

  it('routes header and timeline controls to the premiere controller', async () => {
    render(<GatsbyPremiere onOpenEventNight={vi.fn()} />);
    await userEvent.click(screen.getByTestId('premiere-header__orbit'));
    await userEvent.click(screen.getByTestId('premiere-header__nitrate'));
    await userEvent.click(screen.getByTestId('premiere-header__sound'));
    await userEvent.click(screen.getByTestId('timeline__replay'));
    await userEvent.click(screen.getAllByTestId('timeline__chapter')[2]);
    await userEvent.keyboard(' ');
    expect(controller.toggleCameraMode).toHaveBeenCalledTimes(1);
    expect(controller.toggleNitrateMode).toHaveBeenCalledTimes(1);
    expect(controller.toggleSound).toHaveBeenCalledTimes(1);
    expect(controller.replay).toHaveBeenCalledTimes(1);
    expect(controller.selectAct).toHaveBeenCalledWith(2);
    expect(controller.togglePlayback).toHaveBeenCalledTimes(1);
  });
});
