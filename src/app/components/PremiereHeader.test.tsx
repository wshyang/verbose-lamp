// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PremiereHeader } from './PremiereHeader';

vi.mock('@/features/qr-generator', () => ({ QrGeneratorLauncher: () => null }));
vi.mock('@/features/avatar-studio', () => ({ AvatarStudioLauncher: () => null }));
vi.mock('@/features/event-night', () => ({
  EventNightLauncher: ({ onOpen }: { onOpen: () => void }) => (
    <button type="button" onClick={onOpen} data-testid="event-night__launch">Event Night</button>
  ),
}));

function renderHeader() {
  const handlers = {
    onOpenResearch: vi.fn(),
    onOpenCustomizer: vi.fn(),
    onOpenEventNight: vi.fn(),
    onToggleSpectacle: vi.fn(),
    onToggleCameraMode: vi.fn(),
    onToggleNitrate: vi.fn(),
    onToggleSound: vi.fn(),
  };
  render(
    <PremiereHeader
      cameraMode="orbit"
      nitrateMode
      soundOn={false}
      hudHidden={false}
      spectacleOpen
      {...handlers}
    />
  );
  return handlers;
}

describe('PremiereHeader', () => {
  it('reflects orbit, nitrate, and sound state accessibly', () => {
    renderHeader();
    expect(screen.getByTestId('premiere-header__orbit').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('premiere-header__orbit').textContent).toContain('3D Orbit: On');
    expect(screen.getByTestId('premiere-header__nitrate').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('premiere-header__sound').getAttribute('aria-label')).toBe('Enable sound');
    expect(screen.getByTestId('spectacle-preview__launch').getAttribute('aria-expanded')).toBe('true');
  });

  it('calls every header handler', async () => {
    const user = userEvent.setup();
    const handlers = renderHeader();
    await user.click(screen.getByTestId('premiere-header__research'));
    await user.click(screen.getByTestId('premiere-header__customize'));
    await user.click(screen.getByTestId('event-night__launch'));
    await user.click(screen.getByTestId('spectacle-preview__launch'));
    await user.click(screen.getByTestId('premiere-header__orbit'));
    await user.click(screen.getByTestId('premiere-header__nitrate'));
    await user.click(screen.getByTestId('premiere-header__sound'));
    expect(handlers.onOpenResearch).toHaveBeenCalledOnce();
    expect(handlers.onOpenCustomizer).toHaveBeenCalledOnce();
    expect(handlers.onOpenEventNight).toHaveBeenCalledOnce();
    expect(handlers.onToggleSpectacle).toHaveBeenCalledOnce();
    expect(handlers.onToggleCameraMode).toHaveBeenCalledOnce();
    expect(handlers.onToggleNitrate).toHaveBeenCalledOnce();
    expect(handlers.onToggleSound).toHaveBeenCalledOnce();
  });

  it('renders the hidden idle state with cinema camera, nitrate off, and sound on', () => {
    const handlers = {
      onOpenResearch: vi.fn(),
      onOpenCustomizer: vi.fn(),
      onOpenEventNight: vi.fn(),
      onToggleSpectacle: vi.fn(),
      onToggleCameraMode: vi.fn(),
      onToggleNitrate: vi.fn(),
      onToggleSound: vi.fn(),
    };
    const { container } = render(
      <PremiereHeader
        cameraMode="cinema"
        nitrateMode={false}
        soundOn
        hudHidden
        spectacleOpen={false}
        {...handlers}
      />
    );
    expect(container.querySelector('header')?.className).toContain('opacity-0');
    expect(screen.getByTestId('premiere-header__orbit').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('premiere-header__orbit').textContent).toContain('3D Orbit');
    expect(screen.getByTestId('premiere-header__orbit').textContent).not.toContain('On');
    expect(screen.getByTestId('premiere-header__nitrate').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('premiere-header__sound').getAttribute('aria-label')).toBe('Mute sound');
  });
});
