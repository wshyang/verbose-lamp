// @vitest-environment jsdom
// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';

import userEvent from '@testing-library/user-event';

import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';

import { LuckyDrawStage } from './LuckyDrawStage';

import { LuckyDrawResult } from './LuckyDrawResult';

import { LuckyDrawControls } from './LuckyDrawControls';

import { useDrumCanvas } from '../hooks/useDrumCanvas';

// The drum's painter is covered by its own golden test; here we only need the loop wiring.
const drawDrum = vi.hoisted(() => vi.fn());
vi.mock('../render/drumRenderer', () => ({ drawDrum }));
type FrameCallback = (now: number) => void;
let frames: FrameCallback[] = [];
let now = 0;
beforeEach(() => {
  frames = [];
  now = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function runFrames(count: number, step = 120) {
  for (let index = 0; index < count; index += 1) {
    now += step;
    const pending = frames;
    frames = [];
    for (const frame of pending) frame(now);
  }
}
describe('useDrumCanvas', () => {
  function Harness({ reduced }: { reduced: boolean }) {
    const { canvasRef, swayRef } = useDrumCanvas({
      pool: [
        { id: 'a', name: 'Ada' },
        { id: 'b', name: 'Bertie' },
      ],
      isLanded: reduced,
      positionRef: { current: 0.3 },
      speedRef: { current: 1 },
    });
    return (
      <div ref={swayRef} data-testid="drum__sway">
        <canvas ref={canvasRef} data-testid="drum__canvas" />
      </div>
    );
  }

  it('sizes the canvas and paints on every frame', () => {
    render(<Harness reduced={false} />);
    const canvas = screen.getByTestId('drum__canvas') as HTMLCanvasElement;
    expect(canvas.width).toBeGreaterThan(0);
    act(() => runFrames(3));
    expect(screen.getByTestId('drum__sway').style.transform).toContain('rotate(');
  });

  it('skips the sway while motion is reduced', () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    render(<Harness reduced />);
    act(() => runFrames(2));
    const sway = screen.getByTestId('drum__sway');
    expect(sway.style.transform).toBe('');
  });

  it('paints with placeholders and a one-to-one pixel ratio', () => {
    const original = window.devicePixelRatio;
    Object.defineProperty(window, 'devicePixelRatio', { value: 0, configurable: true });
    render(<Harness reduced={false} />);
    const canvas = screen.getByTestId('drum__canvas') as HTMLCanvasElement;
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(400);
    Object.defineProperty(window, 'devicePixelRatio', { value: original, configurable: true });
  });

  it('cancels its loop on unmount', () => {
    const view = render(<Harness reduced={false} />);
    view.unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});
describe('useDrumCanvas without a sway frame', () => {
  function Bare() {
    const { canvasRef } = useDrumCanvas({
      pool: [{ id: 'solo', name: 'Solo' }],
      isLanded: false,
      positionRef: { current: 0 },
      speedRef: { current: 0 },
    });
    return <canvas ref={canvasRef} data-testid="drum__bare" />;
  }

  it('skips the sway when the frame element is missing', () => {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    render(<Bare />);
    expect(() => act(() => runFrames(2))).not.toThrow();
  });
});
describe('LuckyDrawStage', () => {
  it('draws a winner through the drum and reports it', async () => {
    const onLanded = vi.fn();
    render(<LuckyDrawStage onClose={vi.fn()} onLanded={onLanded} />);
    expect(screen.getByText('THE LUCKY DRAW')).toBeDefined();
    expect(screen.getByTestId('lucky-draw__winner')).toBeDefined();

    await userEvent.click(screen.getByTestId('lucky-draw__spin'));
    act(() => runFrames(400, 200));
    await waitFor(() => expect(onLanded).toHaveBeenCalledTimes(1));
    const winnerName = String(onLanded.mock.calls[0][0].name).toUpperCase();
    expect(screen.getByTestId('lucky-draw__winner').textContent).toContain(winnerName);
  });
});
describe('LuckyDrawResult', () => {
  const winner = { id: 'gatsby', name: 'Jay Gatsby', subtitle: 'West Egg' };

  it('invites the host to spin while idle', () => {
    render(<LuckyDrawResult phase="idle" winner={null} guestsInDrum={289} />);
    const result = screen.getByTestId('lucky-draw__winner');
    expect(result.textContent).toContain('289');
    expect(result.textContent).toContain('GUESTS IN THE DRUM');
  });

  it('shows the drum turning while spinning', () => {
    render(<LuckyDrawResult phase="spinning" winner={winner} guestsInDrum={12} />);
    expect(screen.getByTestId('lucky-draw__winner').textContent).toContain('THE DRUM TURNS');
  });

  it('announces the landed winner', () => {
    render(<LuckyDrawResult phase="landed" winner={winner} guestsInDrum={12} />);
    const result = screen.getByTestId('lucky-draw__winner');
    expect(result.textContent).toContain('JAY GATSBY');
    expect(result.textContent).toContain('West Egg');
  });

  it('handles a landed phase without a winner', () => {
    render(<LuckyDrawResult phase="landed" winner={null} guestsInDrum={12} />);
    expect(screen.getByTestId('lucky-draw__winner')).toBeDefined();
  });
});
describe('LuckyDrawControls', () => {
  function makeDraw(overrides: Record<string, unknown> = {}) {
    return {
      phase: 'idle' as const,
      pool: [{ id: 'a', name: 'Ada' }, { id: 'b', name: 'Bertie' }],
      guestCount: 300,
      drawnCount: 0,
      spin: vi.fn(),
      redraw: vi.fn(),
      reset: vi.fn(),
      setGuestCount: vi.fn(),
      ...overrides,
    } as never;
  }

  it('changes the guest count and can spin', async () => {
    const draw = makeDraw();
    render(<LuckyDrawControls draw={draw} />);
    await userEvent.selectOptions(screen.getByTestId('lucky-draw__entries'), '30');
    expect((draw as { setGuestCount: ReturnType<typeof vi.fn> }).setGuestCount).toHaveBeenCalledWith(30);

    await userEvent.click(screen.getByTestId('lucky-draw__spin'));
    expect((draw as { spin: ReturnType<typeof vi.fn> }).spin).toHaveBeenCalledTimes(1);
  });

  it('disables spin while the drum turns and redraw until a winner lands', () => {
    const spinning = makeDraw({ phase: 'spinning' });
    const { unmount } = render(<LuckyDrawControls draw={spinning} />);
    expect(screen.getByTestId('lucky-draw__spin')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('lucky-draw__redraw')).toHaveProperty('disabled', true);
    unmount();

    const landed = makeDraw({
      phase: 'landed',
      drawnCount: 1,
      pool: [
        { id: 'a', name: 'Ada' },
        { id: 'b', name: 'Bertie' },
        { id: 'c', name: 'Cora' },
        { id: 'd', name: 'Dora' },
      ],
    });
    render(<LuckyDrawControls draw={landed} />);
    expect(screen.getByTestId('lucky-draw__redraw').textContent).toContain('1');
    fireEvent.click(screen.getByTestId('lucky-draw__redraw'));
    expect((landed as { redraw: ReturnType<typeof vi.fn> }).redraw).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('lucky-draw__reset'));
    expect((landed as { reset: ReturnType<typeof vi.fn> }).reset).toHaveBeenCalledTimes(1);
  });

  it('disables both actions for an almost empty drum', () => {
    render(<LuckyDrawControls draw={makeDraw({ phase: 'landed', pool: [{ id: 'a', name: 'Ada' }] })} />);
    expect(screen.getByTestId('lucky-draw__spin')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('lucky-draw__redraw')).toHaveProperty('disabled', true);
  });
});
describe('LuckyDrawResult without a subtitle or winner name casing', () => {
  it('omits the empty subtitle and upcases the name', () => {
    render(<LuckyDrawResult phase="landed" winner={{ id: 'daisy', name: 'Daisy Buchanan' }} guestsInDrum={4} />);
    const result = screen.getByTestId('lucky-draw__winner');
    expect(result.textContent).toBe('DAISY BUCHANAN');
  });
});
