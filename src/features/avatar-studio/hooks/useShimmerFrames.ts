import { useEffect, useState } from 'react';
import type { RgbaImage } from '@/shared/lib/raster';
import { shimmerFrames } from '../shimmer';
import type { ComposedAvatar } from '../types';

/**
 * Frames for the preview: the still first (what reduced motion and the PNG show), then the
 * glint loop. The loop is computed only once the look has settled, so dragging a slider
 * repaints the still at full speed (ADDENDUM-017 §7's settled-preview idea).
 */
const SETTLE_MS = 220;

export function useShimmerFrames(avatar: ComposedAvatar, isShimmering: boolean): readonly RgbaImage[] {
  const [frames, setFrames] = useState<readonly RgbaImage[]>(() => [avatar.image]);
  useEffect(() => {
    setFrames([avatar.image]);
    if (!isShimmering) return undefined;
    const timer = window.setTimeout(() => setFrames([avatar.image, ...shimmerFrames(avatar)]), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [avatar, isShimmering]);
  return frames;
}
