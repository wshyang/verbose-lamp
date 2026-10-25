// @vitest-environment jsdom
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CinematicStage } from './CinematicStage';
import { FloatingHudToggle } from './FloatingHudToggle';
import { OrbitHint } from './OrbitHint';

describe('CinematicStage', () => {
  it('mounts the canvas host with a stable testid and an accessible label', () => {
    const mountRef = createRef<HTMLDivElement>();
    render(<CinematicStage mountRef={mountRef} cameraMode="cinema" hudHidden={false} />);
    const host = screen.getByTestId('cinematic-stage__canvas');
    expect(host).toBe(mountRef.current);
    expect(host.getAttribute('aria-label')).toBe('Interactive WebGL title sequence');
    expect(host.className).not.toContain('cursor-grab');
  });

  it('shows the grab cursor in orbit mode and fades the corner frame with the HUD', () => {
    const mountRef = createRef<HTMLDivElement>();
    const { container } = render(
      <CinematicStage mountRef={mountRef} cameraMode="orbit" hudHidden />,
    );
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
