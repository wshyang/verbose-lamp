import { useMemo } from 'react';
import { composeAvatar, finishSubject, haloOf } from '../model/compose';
import { renderGoldBackdrop } from '../model/goldBackdrop';
import { refineMatte } from '../model/matte';
import type { BackdropStyle, MatteTuning, RgbaImage, SubjectFinish } from '../model/types';
import { seedFor, STUDIO_SIDE, type PreparedSubject } from '../engine/prepareSubject';

/** Phases in one shimmer loop. Enough for a smooth glint, cheap enough to precompute. */
export const SHIMMER_FRAME_COUNT = 10;

interface ShimmerInput {
  readonly subject: PreparedSubject | null;
  readonly style: BackdropStyle;
  readonly tuning: MatteTuning;
  readonly finish: SubjectFinish;
}

function useBackdropFrames(style: BackdropStyle): readonly RgbaImage[] {
  return useMemo(
    () => Array.from({ length: SHIMMER_FRAME_COUNT }, (_, index) =>
      renderGoldBackdrop({ size: STUDIO_SIDE, style, phase: index / SHIMMER_FRAME_COUNT })),
    [style],
  );
}

/** Decides every pixel the studio shows; components only paint the result. */
export function useShimmerFrames({ subject, style, tuning, finish }: ShimmerInput): readonly RgbaImage[] {
  const backdrops = useBackdropFrames(style);
  const matte = useMemo(() => {
    if (subject === null) return null;
    const effective = subject.matte === null ? { ...tuning, isBackgroundRemoved: false } : tuning;
    const raw = subject.matte ?? { width: STUDIO_SIDE, height: STUDIO_SIDE, data: new Uint8ClampedArray(STUDIO_SIDE ** 2) };
    return refineMatte(raw, effective, seedFor(subject.isFaceFound));
  }, [subject, tuning]);
  const finished = useMemo(() => (subject === null ? null : finishSubject(subject.image, finish)), [subject, finish]);
  const halo = useMemo(() => (matte === null || !tuning.isBackgroundRemoved ? null : haloOf(matte, 3)), [matte, tuning]);

  return useMemo(() => {
    if (finished === null || matte === null) return backdrops;
    return backdrops.map((backdrop) => composeAvatar({ backdrop, subject: finished, matte, halo }));
  }, [backdrops, finished, matte, halo]);
}
