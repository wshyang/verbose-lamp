// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { setupDomTests } from '@/test/dom';
import type { useLuckyDraw } from '../hooks/useLuckyDraw';
import { LuckyDrawControls } from './LuckyDrawControls';

setupDomTests();

type Draw = ReturnType<typeof useLuckyDraw>;

const entries = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `g${index}`, name: `Guest ${index}` }));

function draw(overrides: Partial<Draw> = {}): Draw {
  return {
    phase: 'idle',
    winner: null,
    pool: entries(8),
    drawnCount: 1,
    guestCount: 8,
    setGuestCount: vi.fn(),
    spin: vi.fn(),
    redraw: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  } as unknown as Draw;
}

describe('LuckyDrawControls', () => {
  it('offers the three house guest counts and reports the chosen one as a number', () => {
    const value = draw();
    render(<LuckyDrawControls draw={value} />);

    const select = screen.getByTestId('lucky-draw__entries') as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.value)).toEqual(['2', '30', '300']);
    // The select is a fixed house menu, so a count outside it shows as the first option.
    expect(select.value).toBe('2');

    fireEvent.change(select, { target: { value: '300' } });
    expect(value.setGuestCount).toHaveBeenCalledWith(300);
  });

  it('spins while idle and refuses while the drum is already turning', () => {
    const idle = draw();
    const { unmount } = render(<LuckyDrawControls draw={idle} />);
    fireEvent.click(screen.getByTestId('lucky-draw__spin'));
    expect(idle.spin).toHaveBeenCalledTimes(1);
    unmount();

    const spinning = draw({ phase: 'spinning' });
    render(<LuckyDrawControls draw={spinning} />);
    const spin = screen.getByTestId('lucky-draw__spin') as HTMLButtonElement;
    expect(spin.disabled).toBe(true);
    fireEvent.click(spin);
    expect(spinning.spin).not.toHaveBeenCalled();
  });

  it('needs two guests to spin and three to redraw', () => {
    render(<LuckyDrawControls draw={draw({ pool: entries(2), phase: 'landed' })} />);

    expect((screen.getByTestId('lucky-draw__spin') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId('lucky-draw__redraw') as HTMLButtonElement).disabled).toBe(true);

    render(<LuckyDrawControls draw={draw({ pool: entries(1), phase: 'landed' })} />);
    expect((screen.getAllByTestId('lucky-draw__spin')[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it('only redraws once a winner has landed, and shows how many were drawn', () => {
    const landed = draw({ phase: 'landed', drawnCount: 3 });
    render(<LuckyDrawControls draw={landed} />);

    const redraw = screen.getByTestId('lucky-draw__redraw');
    expect(redraw.textContent).toContain('REDRAW (3)');
    fireEvent.click(redraw);
    expect(landed.redraw).toHaveBeenCalledTimes(1);
  });

  it('resets the draw from any phase', () => {
    const value = draw({ phase: 'landed' });
    render(<LuckyDrawControls draw={value} />);

    fireEvent.click(screen.getByTestId('lucky-draw__reset'));

    expect(value.reset).toHaveBeenCalledTimes(1);
    expect((screen.getByTestId('lucky-draw__reset') as HTMLButtonElement).disabled).toBe(false);
  });
});
