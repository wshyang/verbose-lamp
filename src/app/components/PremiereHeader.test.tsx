// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SpectacleProvider } from '@/features/spectacle';
import { PremiereHeader } from './PremiereHeader';

function renderHeader(overrides: Partial<Parameters<typeof PremiereHeader>[0]> = {}) {
  const handlers = {
    onOpenResearch: vi.fn(),
    onOpenCustomizer: vi.fn(),
    onOpenEventNight: vi.fn(),
    onToggleCameraMode: vi.fn(),
    onToggleNitrate: vi.fn(),
    onToggleSound: vi.fn(),
  };
  // The header hosts the spectacle console and the sparkler button, so it needs
  // its provider — the same one the premiere mounts.
  render(
    <SpectacleProvider className="relative h-dvh">
      <PremiereHeader
        cameraMode="cinema"
        nitrateMode={false}
        soundOn={false}
        hudHidden={false}
        {...handlers}
        {...overrides}
      />
    </SpectacleProvider>
  );
  return handlers;
}

describe('PremiereHeader', () => {
  it('calls each handler once, from its own button', async () => {
    const user = userEvent.setup();
    const handlers = renderHeader();
    for (const id of [
      'premiere-header__research',
      'premiere-header__customize',
      'event-night__launch',
      'premiere-header__orbit',
      'premiere-header__nitrate',
      'premiere-header__sound',
    ]) {
      await user.click(screen.getByTestId(id));
    }
    expect(handlers.onOpenResearch).toHaveBeenCalledOnce();
    expect(handlers.onOpenCustomizer).toHaveBeenCalledOnce();
    expect(handlers.onOpenEventNight).toHaveBeenCalledOnce();
    expect(handlers.onToggleCameraMode).toHaveBeenCalledOnce();
    expect(handlers.onToggleNitrate).toHaveBeenCalledOnce();
    expect(handlers.onToggleSound).toHaveBeenCalledOnce();
  });

  it('reflects orbit mode in the label and aria-pressed', () => {
    renderHeader({ cameraMode: 'orbit' });
    const orbit = screen.getByTestId('premiere-header__orbit');
    expect(orbit.getAttribute('aria-pressed')).toBe('true');
    expect(orbit.textContent).toContain('3D Orbit: On');
  });

  it('reflects cinema mode in the label and aria-pressed', () => {
    renderHeader();
    const orbit = screen.getByTestId('premiere-header__orbit');
    expect(orbit.getAttribute('aria-pressed')).toBe('false');
    expect(orbit.textContent).toBe('3D Orbit');
  });

  it('reflects the nitrate toggle', () => {
    renderHeader({ nitrateMode: true });
    expect(screen.getByTestId('premiere-header__nitrate').getAttribute('aria-pressed')).toBe('true');
  });

  it('labels the sound button by what it will do', () => {
    const { unmount } = render(
      <SpectacleProvider>
      <PremiereHeader
        cameraMode="cinema"
        nitrateMode={false}
        soundOn={false}
        hudHidden={false}
        onOpenResearch={vi.fn()}
        onOpenCustomizer={vi.fn()}
        onOpenEventNight={vi.fn()}
        onToggleCameraMode={vi.fn()}
        onToggleNitrate={vi.fn()}
        onToggleSound={vi.fn()}
      />
      </SpectacleProvider>
    );
    expect(screen.getByTestId('premiere-header__sound').getAttribute('aria-label')).toBe(
      'Enable sound'
    );
    unmount();

    render(
      <SpectacleProvider>
      <PremiereHeader
        cameraMode="cinema"
        nitrateMode={false}
        soundOn
        hudHidden={false}
        onOpenResearch={vi.fn()}
        onOpenCustomizer={vi.fn()}
        onOpenEventNight={vi.fn()}
        onToggleCameraMode={vi.fn()}
        onToggleNitrate={vi.fn()}
        onToggleSound={vi.fn()}
      />
      </SpectacleProvider>
    );
    expect(screen.getByTestId('premiere-header__sound').getAttribute('aria-label')).toBe(
      'Mute sound'
    );
  });

  it('fades out and stops taking pointer events when the HUD is hidden', () => {
    renderHeader({ hudHidden: true });
    const header = screen.getByTestId('premiere-header__research').closest('header');
    expect(header?.className).toContain('pointer-events-none');
    expect(header?.className).toContain('opacity-0');
  });
});
