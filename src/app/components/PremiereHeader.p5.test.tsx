// @vitest-environment jsdom
// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it, vi } from 'vitest';

import { render, screen, fireEvent } from '@testing-library/react';

import { PremiereHeader } from './PremiereHeader';

// The celebration launcher needs a spectacle stage; header tests stub it to
// its button so the header can be tested in isolation.
vi.mock('@/features/celebration-overlay', () => ({
  CelebrationLauncher: () => <button type="button" data-testid="celebration-overlay__launch">Celebrate</button>,
}));
function renderHeader_p5(overrides = {}) {
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
  it('toggles orbit, nitrate and sound, reflecting their state', () => {
    const handlers = renderHeader_p5({ cameraMode: 'orbit', nitrateMode: true, soundOn: true });
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
});
