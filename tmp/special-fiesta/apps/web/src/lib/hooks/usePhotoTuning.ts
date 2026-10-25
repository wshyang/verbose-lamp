import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_TUNING,
  withBackground,
  withKnob,
  type CutOutTuning,
  type TuningKnob,
} from '../avatar/cutOut.js';
import { paintPrepared, preparePhotoCells, type PreparedCells } from '../avatar/photoSprite.js';
import type { Bitmap, CropBox, SubjectMask } from '../avatar/types.js';

/**
 * ADR-073 — the three cut-out knobs, and the arithmetic that keeps turning them bearable.
 *
 * What makes it cheap is that the matte is already kept by the studio (ADR-056), so the
 * segmentation model is never asked twice. What it still costs was worth measuring rather than
 * assuming: of ~104 ms for a full rebuild, `preparePhotoCells` is 5.8 ms and the painting is ~95 ms.
 * Caching the cells therefore saves about 6 % — the expense is quantising, and the palette really
 * does depend on which cells a knob just called subject, so it cannot be cached across knob changes.
 *
 * Which leaves the debounce doing the actual work. A trailing 120 ms always lands on the value the
 * finger stopped at, and skipping the frames in between is the right trade at ~95 ms a frame; the
 * coarse buttons, which are the surface nearly everyone uses, land in one tick either way. If a real
 * phone proves too slow the next lever is holding the palette still while a knob moves and
 * recomputing it on release — deliberately not built yet, because it trades honest colour for speed
 * nobody has asked for.
 */

/** Long enough to swallow a drag, short enough that letting go feels like the answer arriving. */
const SETTLE_MS = 120;

export interface PhotoTuningInput {
  /** The decoded photograph, kept by the studio. Null before one is chosen. */
  bitmap: Bitmap | null;
  /** ADR-033 — the model's matte, when there was one. Null means the colour rules did the cutting. */
  subject: SubjectMask | null;
  /** The square as it currently stands. Must be referentially stable, or the cells recompute. */
  crop: CropBox | null;
  colours: { backdrop: string; ink: string };
}

export interface PhotoTuning {
  tuning: CutOutTuning;
  setKnob: (change: { knob: TuningKnob; value: number }) => void;
  /** ADR-077 — cut the background out, or keep the photograph whole. */
  setBackground: (change: { on: boolean }) => void;
  reset: () => void;
  /** The sprite as currently tuned, or null when there is no photograph to tune. */
  sprite: string | null;
  /**
   * ADR-079 — the tuning `sprite` was actually painted from, which lags `tuning` by the debounce.
   *
   * Exposed so a caller can tell a *new rendering of the same photograph* apart from a re-render for
   * some other reason. Its object identity changes exactly once per settled change, which is the
   * signal the studio needs to commit the sprite without mistaking a backdrop repaint for a new
   * photograph.
   */
  settled: CutOutTuning;
  /** A knob has moved and the picture has not caught up yet. */
  isWorking: boolean;
  /** Whether the cut-out strength means anything — it does not without a matte. */
  hasMask: boolean;
}

/** The value as it was once it stopped changing, so a dragged slider paints once. */
function useSettled<TValue>(value: TValue, delay: number): TValue {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

/** The expensive half, remembered against the only two things it depends on. */
function usePreparedCells(bitmap: Bitmap | null, crop: CropBox | null): PreparedCells | null {
  return useMemo(() => (bitmap === null ? null : preparePhotoCells(bitmap, crop)), [bitmap, crop]);
}

export function usePhotoTuning(input: PhotoTuningInput): PhotoTuning {
  const [tuning, setTuning] = useState<CutOutTuning>(DEFAULT_TUNING);
  const settled = useSettled(tuning, SETTLE_MS);
  const prepared = usePreparedCells(input.bitmap, input.crop);
  const { subject, colours } = input;

  const sprite = useMemo(
    () =>
      prepared === null ? null : paintPrepared(prepared, { ...colours, subject, tuning: settled }),
    [prepared, colours, subject, settled],
  );

  return {
    tuning,
    setKnob: useCallback(
      (change: { knob: TuningKnob; value: number }) =>
        setTuning((current) => withKnob(current, change)),
      [],
    ),
    setBackground: useCallback(
      (change: { on: boolean }) => setTuning((current) => withBackground(current, change)),
      [],
    ),
    reset: useCallback(() => setTuning(DEFAULT_TUNING), []),
    sprite,
    settled,
    isWorking: settled !== tuning,
    hasMask: subject !== null,
  };
}
