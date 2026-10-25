// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LuckyDrawControls } from './LuckyDrawControls';
import { LuckyDrawResult } from './LuckyDrawResult';

function drawFixture(overrides: Record<string, unknown> = {}) {
  return {
    phase: 'idle', guestCount: 30, pool: [{}, {}, {}], drawnCount: 2,
    setGuestCount: vi.fn(), spin: vi.fn(), redraw: vi.fn(), reset: vi.fn(),
    ...overrides,
  } as never;
}

describe('LuckyDrawControls', () => {
  it('forwards count and actions in the landed state', async () => {
    const user = userEvent.setup();
    const draw = drawFixture({ phase: 'landed' });
    render(<LuckyDrawControls draw={draw} />);
    fireEvent.change(screen.getByTestId('lucky-draw__entries'), { target: { value: '300' } });
    await user.click(screen.getByTestId('lucky-draw__spin'));
    await user.click(screen.getByTestId('lucky-draw__redraw'));
    await user.click(screen.getByTestId('lucky-draw__reset'));
    const actions = draw as unknown as Record<string, ReturnType<typeof vi.fn>>;
    expect(actions.setGuestCount).toHaveBeenCalledWith(300);
    expect(actions.spin).toHaveBeenCalledOnce();
    expect(actions.redraw).toHaveBeenCalledOnce();
    expect(actions.reset).toHaveBeenCalledOnce();
  });

  it('disables spin while spinning or with too small a pool, and redraw below three', () => {
    const { rerender } = render(<LuckyDrawControls draw={drawFixture({ phase: 'spinning', pool: [{}, {}] })} />);
    expect((screen.getByTestId('lucky-draw__spin') as HTMLButtonElement).disabled).toBe(true);
    rerender(<LuckyDrawControls draw={drawFixture({ phase: 'idle', pool: [{}] })} />);
    expect((screen.getByTestId('lucky-draw__spin') as HTMLButtonElement).disabled).toBe(true);
    rerender(<LuckyDrawControls draw={drawFixture({ phase: 'landed', pool: [{}, {}] })} />);
    expect((screen.getByTestId('lucky-draw__redraw') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('LuckyDrawResult', () => {
  it('announces idle, spinning, and landed states with optional subtitle', () => {
    const { rerender } = render(<LuckyDrawResult phase="idle" winner={null} guestsInDrum={9} />);
    expect(screen.getByTestId('lucky-draw__winner').textContent).toContain('9 GUESTS');
    rerender(<LuckyDrawResult phase="spinning" winner={null} guestsInDrum={9} />);
    expect(screen.getByTestId('lucky-draw__winner').textContent).toContain('DRUM TURNS');
    rerender(<LuckyDrawResult phase="landed" winner={{ id: 'a', name: 'Alice' }} guestsInDrum={8} />);
    expect(screen.getByTestId('lucky-draw__winner').textContent).toContain('ALICE');
    rerender(<LuckyDrawResult phase="landed" winner={{ id: 'b', name: 'Bertie', subtitle: 'Guest' }} guestsInDrum={8} />);
    expect(screen.getByTestId('lucky-draw__winner').textContent).toContain('Guest');
    rerender(<LuckyDrawResult phase="landed" winner={null} guestsInDrum={7} />);
    expect(screen.getByTestId('lucky-draw__winner').textContent).toContain('7 GUESTS');
  });
});
