// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { KeepClearSpeaker } from './KeepClearSpeaker';
import { OriginCrosshair } from './OriginCrosshair';
import { PickOriginHint } from './PickOriginHint';
import { StageBackdrop } from './StageBackdrop';
import { TitleMedallion } from './TitleMedallion';

describe('event night stage bits', () => {
  it('positions and drags the keep-clear speaker box', () => {
    const onMove = vi.fn();
    render(<KeepClearSpeaker rect={{ x: 0.2, y: 0.3, w: 0.16, h: 0.24 }} onMove={onMove} />);
    const box = screen.getByTestId('event-night__speaker');
    expect(box.style.left).toBe('20%');
    expect(box.style.top).toBe('30%');
    expect(box.getAttribute('role')).toBe('img');
    expect(box.getAttribute('aria-label')).toContain('Keep-clear');

    fireEvent.pointerDown(box, { pointerId: 1 });
    fireEvent.pointerMove(box, { pointerId: 1, movementX: 16, movementY: 24 });
    expect(onMove).toHaveBeenCalledWith(
      16 / window.innerWidth,
      24 / window.innerHeight,
    );
    fireEvent.pointerUp(box, { pointerId: 1 });
    fireEvent.pointerMove(box, { pointerId: 1, movementX: 16, movementY: 24 });
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it('pulses the crosshair while picking', () => {
    const { rerender } = render(<OriginCrosshair origin={{ x: 0.5, y: 0.5 }} isPicking={false} />);
    expect(screen.getByTestId('event-night__origin-crosshair').innerHTML).toContain('border-[#d9b264]/80');
    rerender(<OriginCrosshair origin={{ x: 0.25, y: 0.75 }} isPicking />);
    const crosshair = screen.getByTestId('event-night__origin-crosshair');
    expect(crosshair.innerHTML).toContain('animate-pulse');
    expect(crosshair.style.left).toBe('25%');
  });

  it('shows the pick hint and the backdrop', () => {
    render(<PickOriginHint />);
    expect(screen.getByTestId('event-night__pick-hint').textContent).toContain('CLICK ANYWHERE');
    const { container } = render(<StageBackdrop />);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('renders the medallion title, tagline and optional marquee', () => {
    const { rerender } = render(
      <TitleMedallion lattice={{ seed: 1925, density: 0.6, level: 3 }} hasMarquee tagline="FOYER" />,
    );
    expect(document.body.textContent).toContain('GATSBY');
    expect(screen.getByText('DINNER & DANCE')).toBeDefined();
    expect(screen.getByTestId('event-night__tagline').textContent).toBe('FOYER');
    expect(document.querySelectorAll('[data-testid="marquee-border__bulb"]').length).toBeGreaterThan(0);

    rerender(
      <TitleMedallion lattice={{ seed: 7, density: 0.3, level: 1 }} hasMarquee={false} tagline="TOAST" />,
    );
    expect(screen.getByTestId('event-night__tagline').textContent).toBe('TOAST');
    expect(document.querySelectorAll('[data-testid="marquee-border__bulb"]')).toHaveLength(0);
  });
});
