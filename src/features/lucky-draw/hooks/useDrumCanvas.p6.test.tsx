// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { render, renderHook, screen } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DRUM_HEIGHT, DRUM_WIDTH, useDrumCanvas } from './useDrumCanvas';

import { setupDomTests } from '@/test/dom';

import { installCanvas2d } from '@/test/canvas2d';

import { type LuckyDrawEntry } from '../model/entries';

setupDomTests();
const drum = vi.hoisted(() => ({ drawDrum: vi.fn() }));
vi.mock('../render/drumRenderer', () => drum);
const frames: FrameRequestCallback[] = [];
const cancelled: number[] = [];
let nextId_p6 = 1;
const entries: LuckyDrawEntry[] = [
  { id: 'a', name: 'Ada' },
  { id: 'b', name: 'Bo' },
];
/** jsdom's matchMedia is shared state; pin it explicitly for every test. */
const stubMedia = (reducedMotion: boolean) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reducedMotion && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
beforeEach(() => {
  vi.clearAllMocks();
  stubMedia(false);
  frames.length = 0;
  cancelled.length = 0;
  nextId_p6 = 1;
  installCanvas2d();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return nextId_p6++;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    cancelled.push(id);
  });
});
function feed(overrides: Partial<Parameters<typeof useDrumCanvas>[0]> = {}) {
  return {
    pool: entries,
    isLanded: false,
    positionRef: { current: 0.25 },
    speedRef: { current: 0.5 },
    ...overrides,
  };
}
type Feed = Parameters<typeof useDrumCanvas>[0];
/** The drum only starts when the refs are attached during render. */
function Harness({ value }: { value: Feed }) {
  const { canvasRef, swayRef } = useDrumCanvas(value);
  return (
    <div>
      <canvas ref={canvasRef} data-testid="drum" />
      <div ref={swayRef} data-testid="sway" />
    </div>
  );
}
function mount(options: Feed = feed()) {
  const view = render(<Harness value={options} />);
  return {
    ...view,
    canvas: screen.getByTestId('drum') as HTMLCanvasElement,
    sway: screen.getByTestId('sway') as HTMLDivElement,
  };
}
const renderHookWithoutCanvas = () => renderHook(() => useDrumCanvas(feed()));
const step = (now: number) => {
  const frame = frames.pop();
  expect(frame).toBeDefined();
  frame!(now);
};
describe('useDrumCanvas', () => {
  it('sizes the canvas for the device pixel ratio and scales the context', () => {
    const { canvas } = mount();

    expect(canvas.width).toBe(DRUM_WIDTH * Math.min(2, window.devicePixelRatio || 1));
    expect(canvas.height).toBe(DRUM_HEIGHT * Math.min(2, window.devicePixelRatio || 1));
  });

  it('draws the drum from the live feed every frame', () => {
    const { sway } = mount();

    step(1_000);
    step(2_000);

    expect(drum.drawDrum).toHaveBeenCalledTimes(2);
    expect(drum.drawDrum).toHaveBeenLastCalledWith(
      expect.anything(),
      { position: 0.25, entries, speed: 0.5, landedPlateGlow: false },
      { w: DRUM_WIDTH, h: DRUM_HEIGHT }
    );
    // The sway continues to write a transform per frame.
    expect(sway.style.transform).toMatch(/^translateY\(/);
    expect(frames).toHaveLength(1);
  });

  it('substitutes placeholder plates while the pool is too small', () => {
    mount(feed({ pool: [entries[0]] }));

    step(0);

    const [, state] = drum.drawDrum.mock.calls[0];
    expect(state.entries).toHaveLength(2);
    expect(state.entries).toEqual([
      { id: 'a', name: '—' },
      { id: 'b', name: '—' },
    ]);
  });

  it('reads the latest feed without restarting the loop', () => {
    const first = feed();
    const { rerender } = mount(first);

    step(0);
    const next = feed({ isLanded: true, positionRef: { current: 0.75 } });
    rerender(<Harness value={next} />);
    step(1);

    expect(drum.drawDrum).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ position: 0.75, landedPlateGlow: true }),
      expect.anything()
    );
    expect(frames).toHaveLength(1);
  });

  it('stops swaying when the viewer prefers reduced motion', () => {
    stubMedia(true);
    const { sway } = mount();

    step(500);

    expect(sway.style.transform).toBe('');
  });

  it('does nothing without a canvas to draw on', () => {
    const view = renderHookWithoutCanvas();

    expect(view.result.current.canvasRef.current).toBeNull();
    expect(frames).toHaveLength(0);
  });

  it('cancels the loop on unmount', () => {
    const { unmount } = mount();
    step(0);

    unmount();

    expect(cancelled.length).toBeGreaterThan(0);
  });
});
