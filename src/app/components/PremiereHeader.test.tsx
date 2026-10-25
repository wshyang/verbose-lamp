// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  const view = render(
    <PremiereHeader
      cameraMode="cinema"
      nitrateMode={false}
      soundOn={false}
      hudHidden={false}
      launcher={<button type="button" data-testid="premiere-header__spectacle">SPECTACLE</button>}
      {...handlers}
      {...overrides}
    />,
  );
  return { handlers, ...view };
}

describe('PremiereHeader', () => {
  it('brands the sequence and exposes every tool', () => {
    renderHeader();
    expect(screen.getByText('THE GREAT GATSBY')).toBeDefined();
    expect(screen.getByText('WebGL 3D Art Deco Title Sequence')).toBeDefined();
    expect(screen.getByTestId('premiere-header__research')).toBeDefined();
    expect(screen.getByTestId('premiere-header__customize')).toBeDefined();
    expect(screen.getByTestId('qr-generator__launch')).toBeDefined();
    expect(screen.getByTestId('avatar-studio__launch')).toBeDefined();
    expect(screen.getByTestId('premiere-header__spectacle')).toBeDefined();
    expect(screen.getByTestId('event-night__launch')).toBeDefined();
    expect(screen.getByTestId('premiere-header__orbit')).toBeDefined();
    expect(screen.getByTestId('premiere-header__nitrate')).toBeDefined();
    expect(screen.getByTestId('premiere-header__sound')).toBeDefined();
  });

  it('renders without a host launcher', () => {
    renderHeader({ launcher: undefined });
    expect(screen.queryByTestId('premiere-header__spectacle')).toBeNull();
  });

  it('calls each handler once', async () => {
    const { handlers } = renderHeader();
    await userEvent.click(screen.getByTestId('premiere-header__research'));
    await userEvent.click(screen.getByTestId('premiere-header__customize'));
    await userEvent.click(screen.getByTestId('event-night__launch'));
    await userEvent.click(screen.getByTestId('premiere-header__orbit'));
    await userEvent.click(screen.getByTestId('premiere-header__nitrate'));
    await userEvent.click(screen.getByTestId('premiere-header__sound'));
    expect(handlers.onOpenResearch).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenCustomizer).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenEventNight).toHaveBeenCalledTimes(1);
    expect(handlers.onToggleCameraMode).toHaveBeenCalledTimes(1);
    expect(handlers.onToggleNitrate).toHaveBeenCalledTimes(1);
    expect(handlers.onToggleSound).toHaveBeenCalledTimes(1);
  });

  it('reflects orbit, nitrate and sound state in labels and aria-pressed', () => {
    renderHeader({ cameraMode: 'orbit', nitrateMode: true, soundOn: true });
    const orbit = screen.getByTestId('premiere-header__orbit');
    expect(orbit.getAttribute('aria-pressed')).toBe('true');
    expect(orbit.textContent).toContain('3D Orbit: On');
    expect(screen.getByTestId('premiere-header__nitrate').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('premiere-header__sound').getAttribute('aria-label')).toBe('Mute sound');
  });

  it('names the sound toggle for the next action while muted', () => {
    renderHeader();
    expect(screen.getByTestId('premiere-header__sound').getAttribute('aria-label')).toBe('Enable sound');
    expect(screen.getByTestId('premiere-header__orbit').textContent).toContain('3D Orbit');
  });

  it('hides itself when the HUD is hidden but stays mounted', () => {
    const { container } = renderHeader({ hudHidden: true });
    const header = container.querySelector('header');
    expect(header?.className).toContain('pointer-events-none');
    expect(header?.className).toContain('opacity-0');
  });
});
