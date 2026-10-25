// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KeepClearSpeaker } from './KeepClearSpeaker';
import { OriginCrosshair } from './OriginCrosshair';
import { PickOriginHint } from './PickOriginHint';

describe('OriginCrosshair', () => {
  it('sits at the origin as percentages of the stage and is hidden from assistive tech', () => {
    render(<OriginCrosshair origin={{ x: 0.25, y: 0.8 }} isPicking={false} />);

    const crosshair = screen.getByTestId('spectacle-preview__crosshair');
    expect(crosshair.style.left).toBe('25%');
    expect(crosshair.style.top).toBe('80%');
    expect(crosshair.getAttribute('aria-hidden')).toBe('true');
  });

  it('pulses only while the origin is being picked', () => {
    const { container, rerender } = render(<OriginCrosshair origin={{ x: 0.5, y: 0.5 }} isPicking={false} />);
    const ring = () => container.querySelector('.rounded-full') as HTMLElement;

    expect(ring().className).not.toContain('animate-pulse');
    rerender(<OriginCrosshair origin={{ x: 0.5, y: 0.5 }} isPicking />);
    expect(ring().className).toContain('animate-pulse');
  });

  it('lets a host choose its own test id', () => {
    render(<OriginCrosshair origin={{ x: 0, y: 0 }} isPicking={false} testId="event-night__origin-crosshair" />);

    expect(screen.getByTestId('event-night__origin-crosshair')).toBeTruthy();
    expect(screen.queryByTestId('spectacle-preview__crosshair')).toBeNull();
  });

  it('never steals pointer events from the stage under it', () => {
    render(<OriginCrosshair origin={{ x: 0.5, y: 0.5 }} isPicking />);

    expect(screen.getByTestId('spectacle-preview__crosshair').className).toContain('pointer-events-none');
  });
});

describe('PickOriginHint', () => {
  it('tells the host what a click will do, under a default or a chosen test id', () => {
    const { rerender } = render(<PickOriginHint />);
    expect(screen.getByTestId('spectacle-preview__pick-hint').textContent).toContain('SET THE ORIGIN');

    rerender(<PickOriginHint testId="event-night__pick-hint" />);
    expect(screen.getByTestId('event-night__pick-hint')).toBeTruthy();
  });
});

describe('KeepClearSpeaker', () => {
  const rect = { x: 0.4, y: 0.2, w: 0.16, h: 0.24 };

  it('is laid out from its normalised rectangle and described for assistive tech', () => {
    render(<KeepClearSpeaker rect={rect} onMove={vi.fn()} />);

    const box = screen.getByTestId('spectacle-preview__speaker');
    expect([box.style.left, box.style.top, box.style.width, box.style.height]).toEqual(['40%', '20%', '16%', '24%']);
    expect(box.getAttribute('role')).toBe('img');
    expect(box.getAttribute('aria-label')).toContain('Keep-clear');
  });

  it('reports a drag as viewport fractions through onMove', () => {
    const onMove = vi.fn();
    render(<KeepClearSpeaker rect={rect} onMove={onMove} testId="event-night__speaker" />);
    const box = screen.getByTestId('event-night__speaker');
    Object.assign(box, { setPointerCapture: vi.fn() });

    fireEvent.pointerDown(box, { pointerId: 1 });
    fireEvent.pointerMove(box, { pointerId: 1, movementX: 0, movementY: 0 });
    expect(onMove).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(box, { pointerId: 1 });
    fireEvent.pointerMove(box, { pointerId: 1, movementX: 0, movementY: 0 });

    expect(onMove).toHaveBeenCalledTimes(1);
  });
});
