import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TUNING } from '../avatar/cutOut.js';
import type { Bitmap, SubjectMask } from '../avatar/types.js';
import { usePhotoTuning, type PhotoTuningInput } from './usePhotoTuning.js';

/**
 * ADR-073 — the knobs, and the debounce that keeps a slider from painting on every frame.
 *
 * The matte below has a lump deliberately detached from the main shape, because that is the whole
 * point of the feature: "Keep" and "Remove" must produce visibly different sprites, and the default
 * must be the one without the lump.
 */

const SIDE = 64;
/** Stable across renders on purpose — an unstable crop would rebuild the cells every time. */
const CROP = { x: 0, y: 0, size: SIDE };
const COLOURS = { backdrop: '#1d5b8c', ink: '#12243a' };

function bitmap(): Bitmap {
  const pixels = new Uint8ClampedArray(SIDE * SIDE * 4);
  for (let at = 0; at < SIDE * SIDE; at += 1) {
    pixels[at * 4] = (at * 5) % 256;
    pixels[at * 4 + 1] = (at * 11) % 256;
    pixels[at * 4 + 2] = (at * 23) % 256;
    pixels[at * 4 + 3] = 255;
  }
  return { width: SIDE, height: SIDE, pixels };
}

/** A body around the middle, plus a lump in the corner with no path to it. */
function matteWithLump(): SubjectMask {
  const alpha = new Uint8Array(SIDE * SIDE);
  for (let y = 0; y < SIDE; y += 1) {
    for (let x = 0; x < SIDE; x += 1) {
      const dx = (x - 32) / 18;
      const dy = (y - 33) / 18;
      const inBody = dx * dx + dy * dy < 1;
      const inLump = x >= 2 && x <= 6 && y >= 2 && y <= 6;
      alpha[y * SIDE + x] = inBody || inLump ? 255 : 0;
    }
  }
  return { width: SIDE, height: SIDE, alpha };
}

const inputWith = (subject: SubjectMask | null): PhotoTuningInput => ({
  bitmap: bitmap(),
  subject,
  crop: CROP,
  colours: COLOURS,
});

/** Let the trailing debounce fire and the re-render land. */
function settle(): void {
  act(() => {
    vi.advanceTimersByTime(200);
  });
}

describe('usePhotoTuning', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('has nothing to tune before a photograph arrives', () => {
    const { result } = renderHook(() =>
      usePhotoTuning({ bitmap: null, subject: null, crop: null, colours: COLOURS }),
    );

    expect(result.current.sprite).toBeNull();
    expect(result.current.hasMask).toBe(false);
  });

  it('starts at the defaults, with the cut-out row meaningful only when there is a matte', () => {
    const withModel = renderHook(() => usePhotoTuning(inputWith(matteWithLump())));
    const withoutModel = renderHook(() => usePhotoTuning(inputWith(null)));

    expect(withModel.result.current.tuning).toEqual(DEFAULT_TUNING);
    expect(withModel.result.current.hasMask).toBe(true);
    expect(withoutModel.result.current.hasMask).toBe(false);
    expect(withoutModel.result.current.sprite).not.toBeNull();
  });

  it('drops the detached lump by default and keeps it when asked to', () => {
    const { result } = renderHook(() => usePhotoTuning(inputWith(matteWithLump())));
    const pruned = result.current.sprite;

    act(() => result.current.setKnob({ knob: 'minIsland', value: 0 }));
    settle();

    expect(result.current.tuning.minIsland).toBe(0);
    expect(result.current.sprite).not.toBe(pruned);
  });

  it('holds the old picture until the knob settles, then shows the new one', () => {
    const { result } = renderHook(() => usePhotoTuning(inputWith(matteWithLump())));
    const before = result.current.sprite;

    act(() => result.current.setKnob({ knob: 'minIsland', value: 0 }));

    expect(result.current.isWorking).toBe(true);
    expect(result.current.sprite).toBe(before);

    settle();

    expect(result.current.isWorking).toBe(false);
    expect(result.current.sprite).not.toBe(before);
  });

  it('paints once for a drag that passes through many values', () => {
    const { result } = renderHook(() => usePhotoTuning(inputWith(matteWithLump())));

    act(() => {
      for (const value of [140, 150, 160, 170, 180]) {
        result.current.setKnob({ knob: 'threshold', value });
      }
    });
    settle();

    expect(result.current.tuning.threshold).toBe(180);
    expect(result.current.isWorking).toBe(false);
  });

  /*
   * ADR-077 — the escape hatch. A photograph the model reads badly should be keepable whole, and the
   * sprite it produces must actually differ from the cut-out one, or the button is a placebo.
   */
  it('keeps the whole photograph when the cut-out is turned off', () => {
    const { result } = renderHook(() => usePhotoTuning(inputWith(matteWithLump())));
    const cutOut = result.current.sprite;

    act(() => result.current.setBackground({ on: false }));
    settle();

    expect(result.current.tuning.removeBackground).toBe(false);
    expect(result.current.sprite).not.toBe(cutOut);
  });

  it('turns the cut-out back on and lands on the picture it started from', () => {
    const { result } = renderHook(() => usePhotoTuning(inputWith(matteWithLump())));
    const original = result.current.sprite;

    act(() => result.current.setBackground({ on: false }));
    settle();
    act(() => result.current.setBackground({ on: true }));
    settle();

    expect(result.current.sprite).toBe(original);
  });

  it('leaves the numbers alone while the cut-out is off, so turning it back on restores them', () => {
    const { result } = renderHook(() => usePhotoTuning(inputWith(matteWithLump())));

    act(() => result.current.setKnob({ knob: 'edge', value: -1 }));
    act(() => result.current.setBackground({ on: false }));
    settle();

    expect(result.current.tuning.edge).toBe(-1);
  });

  it('clamps a knob to its own bounds', () => {
    const { result } = renderHook(() => usePhotoTuning(inputWith(matteWithLump())));

    act(() => result.current.setKnob({ knob: 'edge', value: 9 }));

    expect(result.current.tuning.edge).toBe(2);
  });

  it('goes back to the defaults on reset', () => {
    const { result } = renderHook(() => usePhotoTuning(inputWith(matteWithLump())));
    const original = result.current.sprite;

    act(() => result.current.setKnob({ knob: 'minIsland', value: 0 }));
    settle();
    act(() => result.current.reset());
    settle();

    expect(result.current.tuning).toEqual(DEFAULT_TUNING);
    expect(result.current.sprite).toBe(original);
  });
});
