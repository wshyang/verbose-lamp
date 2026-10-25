// @vitest-environment jsdom
// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { render, renderHook } from '@testing-library/react';

import { useRef } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DRUM_HEIGHT, DRUM_WIDTH, useDrumCanvas } from './useDrumCanvas';

const mocks = vi.hoisted(() => ({ reduced: false, drawDrum: vi.fn() }));
vi.mock('@/shared/hooks/useReducedMotion', () => ({ useReducedMotion: () => mocks.reduced }));
vi.mock('../render/drumRenderer', () => ({ drawDrum: mocks.drawDrum }));
const ENTRIES = [
  { id: 'a', name: 'Alice' },
  { id: 'b', name: 'Bertie' },
] as const;
let callbacks = new Map<number, FrameRequestCallback>();
let nextId = 1;
const fakeCtx = { setTransform: vi.fn() };
function frame(now: number) {
  const pending = [...callbacks.values()];
  callbacks.clear();
  pending.forEach((callback) => callback(now));
}
function DrumHarness({ pool, landed, sway = true }: {
  pool: readonly typeof ENTRIES[number][];
  landed: boolean;
  sway?: boolean;
}) {
  const positionRef = useRef(4);
  const speedRef = useRef(3);
  const { canvasRef, swayRef } = useDrumCanvas({ pool, isLanded: landed, positionRef, speedRef });
  return (
    <div ref={sway ? swayRef : undefined} data-testid="sway">
      <canvas ref={canvasRef} />
    </div>
  );
}
beforeEach(() => {
  callbacks = new Map();
  nextId = 1;
  mocks.reduced = false;
  vi.clearAllMocks();
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 3 });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeCtx as never);
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    const id = nextId++;
    callbacks.set(id, callback);
    return id;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => callbacks.delete(id)));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('useDrumCanvas', () => {
  it('does nothing until a canvas is attached', () => {
    renderHook(() => useDrumCanvas({
      pool: ENTRIES, isLanded: false, positionRef: { current: 0 }, speedRef: { current: 0 },
    }));
    expect(callbacks.size).toBe(0);
  });

  it('sizes at capped DPR, draws latest feed, sways, and cleans up', () => {
    const { container, rerender, unmount } = render(<DrumHarness pool={ENTRIES} landed={false} />);
    const canvas = container.querySelector('canvas')!;
    expect([canvas.width, canvas.height]).toEqual([DRUM_WIDTH * 2, DRUM_HEIGHT * 2]);
    expect(fakeCtx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    frame(1500);
    expect(mocks.drawDrum).toHaveBeenCalledWith(fakeCtx, {
      position: 4, entries: ENTRIES, speed: 3, landedPlateGlow: false,
    }, { w: DRUM_WIDTH, h: DRUM_HEIGHT });
    expect((screenSway(container) as HTMLElement).style.transform).toContain('translateY(6px)');

    rerender(<DrumHarness pool={[ENTRIES[0]]} landed sway={false} />);
    frame(3000);
    expect(mocks.drawDrum).toHaveBeenLastCalledWith(fakeCtx, expect.objectContaining({
      landedPlateGlow: true,
      entries: [{ id: 'a', name: '—' }, { id: 'b', name: '—' }],
    }), { w: DRUM_WIDTH, h: DRUM_HEIGHT });
    unmount();
    expect(callbacks.size).toBe(0);
  });

  it('uses DPR fallback and does not sway under reduced motion', () => {
    mocks.reduced = true;
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 0 });
    const { container } = render(<DrumHarness pool={ENTRIES} landed />);
    const canvas = container.querySelector('canvas')!;
    expect([canvas.width, canvas.height]).toEqual([DRUM_WIDTH, DRUM_HEIGHT]);
    frame(1500);
    expect((screenSway(container) as HTMLElement).style.transform).toBe('');
  });
});
function screenSway(container: HTMLElement) {
  return container.querySelector('[data-testid="sway"]');
}
