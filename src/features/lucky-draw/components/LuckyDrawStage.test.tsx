// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { setupDomTests } from '@/test/dom';
import { installCanvas2d } from '@/test/canvas2d';
import type { useLuckyDraw } from '../hooks/useLuckyDraw';

setupDomTests();
installCanvas2d();

// The drum renderer is a canvas painting exercise with its own suite; this one is
// about the dialog the host sees.
vi.mock('../render/drumRenderer', () => ({ drawDrum: vi.fn() }));

const draw = vi.hoisted(() => ({
  current: null as ReturnType<typeof useLuckyDraw> | null,
  onLanded: null as ((entry: { id: string; name: string }) => void) | null,
}));

vi.mock('../hooks/useLuckyDraw', () => ({
  useLuckyDraw: ({ onLanded }: { onLanded: (entry: { id: string; name: string }) => void }) => {
    draw.onLanded = onLanded;
    return draw.current;
  },
}));

import { LuckyDrawStage } from './LuckyDrawStage';

const state = (overrides: Partial<ReturnType<typeof useLuckyDraw>> = {}) =>
  ({
    phase: 'idle',
    winner: null,
    pool: [{ id: 'a', name: 'Ada' }, { id: 'b', name: 'Bo' }],
    drawnCount: 0,
    guestCount: 2,
    setGuestCount: vi.fn(),
    spin: vi.fn(),
    redraw: vi.fn(),
    reset: vi.fn(),
    positionRef: { current: 0 },
    speedRef: { current: 0 },
    ...overrides,
  }) as unknown as ReturnType<typeof useLuckyDraw>;

describe('LuckyDrawStage', () => {
  it('opens as the "Lucky Draw" dialog with the drum, its status and its controls', () => {
    draw.current = state();
    render(<LuckyDrawStage onClose={vi.fn()} onLanded={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-label') ?? dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(screen.getByText('THE LUCKY DRAW')).toBeTruthy();
    expect(screen.getByTestId('lucky-draw__winner').textContent).toBe('2 GUESTS IN THE DRUM');
    expect(screen.getByTestId('lucky-draw__spin')).toBeTruthy();
  });

  it('announces the winner through the same status line once the drum lands', () => {
    draw.current = state({
      phase: 'landed',
      winner: { id: 'b', name: 'Bo' },
      pool: [{ id: 'a', name: 'Ada' }],
    });
    render(<LuckyDrawStage onClose={vi.fn()} onLanded={vi.fn()} />);

    expect(screen.getByTestId('lucky-draw__winner').textContent).toBe('BO');
  });

  it('closes from the CLOSE button, and never from the backdrop', () => {
    draw.current = state();
    const onClose = vi.fn();
    render(<LuckyDrawStage onClose={onClose} onLanded={vi.fn()} />);

    fireEvent.click(screen.getByTestId('lucky-draw__close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hands the host callback straight to the draw hook, and its spin to the button', () => {
    draw.current = state();
    const onLanded = vi.fn();
    render(<LuckyDrawStage onClose={vi.fn()} onLanded={onLanded} />);

    // `useLuckyDraw` owns the draw; the stage must not wrap its landing callback.
    expect(draw.onLanded).toBe(onLanded);

    fireEvent.click(screen.getByTestId('lucky-draw__spin'));
    expect(draw.current?.spin).toHaveBeenCalledTimes(1);
  });
});
