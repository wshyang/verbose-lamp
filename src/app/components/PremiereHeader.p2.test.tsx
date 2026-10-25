// @vitest-environment jsdom
// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PremiereHeader } from './PremiereHeader';

vi.mock('@/features/qr-generator', () => ({ QrGeneratorLauncher: () => null }));
vi.mock('@/features/avatar-studio', () => ({ AvatarStudioLauncher: () => null }));
vi.mock('@/features/event-night', () => ({
  EventNightLauncher: ({ onOpen }: { onOpen: () => void }) => (
    <button type="button" onClick={onOpen} data-testid="event-night__launch">Event Night</button>
  ),
}));

describe('PremiereHeader', () => {

  it('renders the hidden idle state with cinema camera, nitrate off, and sound on', () => {
    const handlers = {
      onOpenResearch: vi.fn(),
      onOpenCustomizer: vi.fn(),
      onOpenEventNight: vi.fn(),
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
