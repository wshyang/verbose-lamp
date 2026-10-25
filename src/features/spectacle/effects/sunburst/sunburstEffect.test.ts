import { describe, expect, it } from 'vitest';
import type { FrameInfo } from '../../engine/types';
import { qualitySettings } from '../../model/quality';
import { createRecordingContext } from '../../testing/recordingCanvas';
import { sunburstEffect } from './sunburstEffect';

const RAYS = 24;
const MID_COVER_MS = 360;
const VIEWPORTS = [
  { name: 'desktop 1440x900', w: 1440, h: 900 },
  { name: 'portrait phone 390x844', w: 390, h: 844 },
] as const;

function wedgeFillsAt(viewport: { w: number; h: number }, tMs: number): number {
  const instance = sunburstEffect.create(
    { quality: qualitySettings('high'), reducedMotion: false, announce: () => {} },
    { origin: { x: 0.5, y: 0.42 }, rays: RAYS, variant: 'iris' },
  );
  const { ctx, log } = createRecordingContext();
  const frame: FrameInfo = { ctx, ...viewport, fade: 1 };
  instance.update(tMs, frame);
  return log.filter((entry) => entry === 'fill()').length;
}

describe('sunburstEffect iris', () => {
  for (const viewport of VIEWPORTS) {
    it(`draws every wedge while the iris is growing on ${viewport.name}`, () => {
      expect(wedgeFillsAt(viewport, MID_COVER_MS)).toBe(RAYS);
    });

    it(`draws nothing before the iris opens on ${viewport.name}`, () => {
      expect(wedgeFillsAt(viewport, 0)).toBe(0);
    });
  }
});
