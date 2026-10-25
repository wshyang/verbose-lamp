// @vitest-environment jsdom
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createPremiereStore } from '@/features/premiere/scene3d/premiereStore';
import { CinematicStage } from './CinematicStage';
import { FloatingHudToggle } from './FloatingHudToggle';
import { OrbitHint } from './OrbitHint';

// The real canvas needs WebGL; these tests are about the DOM the stage writes.
vi.mock('@/features/premiere/scene3d/PremiereCanvas', () => ({
  PremiereCanvas: ({ store }: { store: unknown }) => (
    <div data-testid="premiere-canvas" data-has-store={String(Boolean(store))} />
  ),
}));

const stage = (extra: Partial<Parameters<typeof CinematicStage>[0]> = {}) => ({
  mountRef: createRef<HTMLDivElement>(),
  store: createPremiereStore(),
  cameraMode: 'cinema' as const,
  hudHidden: false,
  ...extra,
});

describe('CinematicStage', () => {
  it('mounts the canvas host with a stable testid and an accessible label', () => {
    const props = stage();
    render(<CinematicStage {...props} />);
    const host = screen.getByTestId('cinematic-stage__canvas');
    expect(host).toBe(props.mountRef.current);
    expect(screen.getByTestId('premiere-canvas').dataset.hasStore).toBe('true');
    expect(host.getAttribute('aria-label')).toBe('Interactive WebGL title sequence');
    expect(host.className).not.toContain('cursor-grab');
  });

  it('shows the grab cursor in orbit mode and fades the corner frame with the HUD', () => {
    const { container } = render(<CinematicStage {...stage({ cameraMode: 'orbit', hudHidden: true })} />);
    expect(screen.getByTestId('cinematic-stage__canvas').className).toContain('cursor-grab');
    const frame = container.querySelector('[aria-hidden="true"]');
    expect(frame?.className).toContain('opacity-0');
  });
});

describe('FloatingHudToggle', () => {
  it('describes the action that will happen next', async () => {
    const onToggle = vi.fn();
    const { rerender } = render(<FloatingHudToggle isHidden={false} onToggle={onToggle} />);
    const visibleToggle = screen.getByTestId('premiere-hud__toggle');
    expect(visibleToggle.getAttribute('aria-label')).toBe('Hide cinema controls');
    expect(visibleToggle.getAttribute('title')).toBe('Hide Cinema Controls (H)');
    await userEvent.click(visibleToggle);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<FloatingHudToggle isHidden onToggle={onToggle} />);
    expect(screen.getByTestId('premiere-hud__toggle').getAttribute('aria-label')).toBe(
      'Show cinema controls',
    );
  });
});

describe('OrbitHint', () => {
  it('renders the drag hint only while orbiting', () => {
    const { rerender } = render(<OrbitHint isVisible={false} />);
    expect(screen.queryByText(/Drag to Orbit/)).toBeNull();
    rerender(<OrbitHint isVisible />);
    expect(screen.getByText(/Drag to Orbit/)).toBeDefined();
  });
});
