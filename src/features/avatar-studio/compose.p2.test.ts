// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, HAWKER_CROP, buildHawkerFrame, buildHawkerMatte } from '@/features/background-removal';
import { DEFAULT_BACKDROPS } from '@/features/enamel-backdrop';
import { GILDING_PRESETS } from '@/features/gilded-portrait';
import { AVATAR_SIZE, composeAvatar, composeLayers, emptySubject } from './compose';
import { STAGE_HINTS, isStageBusy, stageHint } from './stage';
import { type AvatarComposition } from './types';

const photo_p2 = buildHawkerFrame();
const matte_p2 = buildHawkerMatte();
const backdropSpec_p2 = DEFAULT_BACKDROPS[0].spec;
function composition_p2(overrides: Partial<AvatarComposition> = {}): AvatarComposition {
  return {
    photo: photo_p2, crop: HAWKER_CROP, matte: matte_p2, tuning: DEFAULT_TUNING, finish: 'natural',
    gilding: GILDING_PRESETS[0].params, backdrop: backdropSpec_p2, frame: 'medallion', size: 64, ...overrides,
  };
}
describe('composeAvatar', () => {
  it('builds an empty subject and composes a backdrop without metal data', () => {
    const subject = emptySubject(4);
    expect(subject.shine).toBe(0);
    expect(subject.alpha.data.every((value) => value === 0)).toBe(true);
    const backdrop = { image: { width: 4, height: 4, data: new Uint8ClampedArray(64).fill(40) } };
    const composed = composeLayers({ subject, backdrop, frame: 'plaque', rampId: 'bright' });
    expect(composed.image.data[20]).toBe(40);
    expect(composed.metal.data[5]).toBe(0);
  });

  it('rejects mismatched layer sizes and defaults composition to 512', () => {
    const subject = emptySubject(4);
    const backdrop = { image: { width: 5, height: 5, data: new Uint8ClampedArray(100) } };
    expect(() => composeLayers({ subject, backdrop, frame: 'plaque', rampId: 'bright' }))
      .toThrow(RangeError);
    const avatar = composeAvatar({ ...composition_p2(), size: undefined });
    expect(avatar.width).toBe(AVATAR_SIZE);
  });
});
describe('nextStage', () => {
  it('reports only working/refining as busy and resolves stage hints', () => {
    expect(isStageBusy('working')).toBe(true);
    expect(isStageBusy('refining')).toBe(true);
    for (const stage of ['idle', 'ready', 'plain', 'cropping', 'failed'] as const) {
      expect(isStageBusy(stage)).toBe(false);
      expect(stageHint(stage)).toBe(STAGE_HINTS[stage]);
    }
  });
});
