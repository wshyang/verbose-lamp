// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PremiereHeader } from './PremiereHeader';

// The celebration launcher needs a spectacle stage; header tests stub it to
// its button so the header can be tested in isolation.
vi.mock('@/features/celebration-overlay', () => ({
  CelebrationLauncher: () => <button type="button" data-testid="celebration-overlay__launch">Celebrate</button>,
}));

function renderHeader(overrides = {}) {
  const handlers = {
    onOpenResearch: vi.fn(),
    onOpenCustomizer: vi.fn(),
    onOpenEventNight: vi.fn(),
    onToggleCameraMode: vi.fn(),
    onToggleNitrate: vi.fn(),
    onToggleSound: vi.fn(),
  };
  render(
    <PremiereHeader
      cameraMode="cinema"
      nitrateMode={false}
      soundOn={false}
      hudHidden={false}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe('PremiereHeader', () => {
  it('opens every feature through its handler or launcher', () => {
    const handlers = renderHeader();
    fireEvent.click(screen.getByTestId('premiere-header__research'));
    expect(handlers.onOpenResearch).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId('premiere-header__customize'));
    expect(handlers.onOpenCustomizer).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId('event-night__launch'));
    expect(handlers.onOpenEventNight).toHaveBeenCalledOnce();
    expect(screen.getByTestId('qr-generator__launch')).toBeTruthy();
    expect(screen.getByTestId('avatar-studio__launch')).toBeTruthy();
    expect(screen.getByTestId('celebration-overlay__launch')).toBeTruthy();
  });

  it('toggles orbit, nitrate and sound, reflecting their state', () => {
    const handlers = renderHeader({ cameraMode: 'orbit', nitrateMode: true, soundOn: true });
    const orbit = screen.getByTestId('premiere-header__orbit');
    expect(orbit.getAttribute('aria-pressed')).toBe('true');
    expect(orbit.textContent).toContain('3D Orbit: On');
    const nitrate = screen.getByTestId('premiere-header__nitrate');
    expect(nitrate.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(orbit);
    fireEvent.click(nitrate);
    fireEvent.click(screen.getByTestId('premiere-header__sound'));
    expect(handlers.onToggleCameraMode).toHaveBeenCalledOnce();
    expect(handlers.onToggleNitrate).toHaveBeenCalledOnce();
    expect(handlers.onToggleSound).toHaveBeenCalledOnce();
  });

  it('hides itself from pointer and view when the HUD is hidden', () => {
    renderHeader({ hudHidden: true });
    const header = screen.getByTestId('premiere-header__research').closest('header');
    expect(header?.className).toContain('pointer-events-none');
    expect(header?.className).toContain('opacity-0');
  });
});
