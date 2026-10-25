// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it, vi } from 'vitest';

import { render, screen } from '@testing-library/react';

import userEvent from '@testing-library/user-event';

import { PremiereHeader } from './PremiereHeader';

import { type ComponentProps } from 'react';

import { setupDomTests } from '@/test/dom';

setupDomTests();
const baseProps = {
  cameraMode: 'cinema' as const,
  nitrateMode: false,
  soundOn: false,
  hudHidden: false,
  onOpenResearch: vi.fn(),
  onOpenCustomizer: vi.fn(),
  onOpenEventNight: vi.fn(),
  onToggleCameraMode: vi.fn(),
  onToggleNitrate: vi.fn(),
  onToggleSound: vi.fn(),
};
const renderHeader_p6 = (overrides: Partial<ComponentProps<typeof PremiereHeader>> = {}) =>
  render(<PremiereHeader {...baseProps} {...overrides} />);
describe('PremiereHeader', () => {
  it('opens the research dossier', async () => {
    const onOpenResearch = vi.fn();
    renderHeader_p6({ onOpenResearch });
    await userEvent.click(screen.getByTestId('premiere-header__research'));
    expect(onOpenResearch).toHaveBeenCalledTimes(1);
  });

  it('opens the title customizer', async () => {
    const onOpenCustomizer = vi.fn();
    renderHeader_p6({ onOpenCustomizer });
    await userEvent.click(screen.getByTestId('premiere-header__customize'));
    expect(onOpenCustomizer).toHaveBeenCalledTimes(1);
  });

  it('toggles the orbit camera and reports its state', async () => {
    const onToggleCameraMode = vi.fn();
    const { rerender } = renderHeader_p6({ onToggleCameraMode });
    expect(screen.getByTestId('premiere-header__orbit').getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(screen.getByTestId('premiere-header__orbit'));
    expect(onToggleCameraMode).toHaveBeenCalledTimes(1);
    rerender(<PremiereHeader {...baseProps} cameraMode="orbit" />);
    expect(screen.getByTestId('premiere-header__orbit').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('premiere-header__orbit').textContent).toContain('3D Orbit: On');
  });

  it('toggles the nitrate look and reports its state', async () => {
    const onToggleNitrate = vi.fn();
    const { rerender } = renderHeader_p6({ onToggleNitrate });
    await userEvent.click(screen.getByTestId('premiere-header__nitrate'));
    expect(onToggleNitrate).toHaveBeenCalledTimes(1);
    rerender(<PremiereHeader {...baseProps} nitrateMode />);
    expect(screen.getByTestId('premiere-header__nitrate').getAttribute('aria-pressed')).toBe('true');
  });

  it('labels the sound control from state and toggles it', async () => {
    const onToggleSound = vi.fn();
    const { rerender } = renderHeader_p6({ onToggleSound });
    expect(screen.getByTestId('premiere-header__sound').getAttribute('aria-label')).toBe('Enable sound');
    await userEvent.click(screen.getByTestId('premiere-header__sound'));
    expect(onToggleSound).toHaveBeenCalledTimes(1);
    rerender(<PremiereHeader {...baseProps} soundOn />);
    expect(screen.getByTestId('premiere-header__sound').getAttribute('aria-label')).toBe('Mute sound');
  });

  it('renders a host-supplied launcher beside the built-in ones', () => {
    renderHeader_p6({ launcher: <button type="button" data-testid="host__launcher">SPECTACLE</button> });
    expect(screen.getByTestId('host__launcher')).toBeTruthy();
  });

  it('fades out of the way when the HUD is hidden', () => {
    renderHeader_p6({ hudHidden: true });
    const header = screen.getByTestId('premiere-header__research').closest('header');
    expect(header?.className ?? '').toContain('pointer-events-none');
    expect(header?.className ?? '').toContain('opacity-0');
  });
});
