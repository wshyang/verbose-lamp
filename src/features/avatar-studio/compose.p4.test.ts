// From PR #4 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, HAWKER_CROP, buildHawkerFrame, buildHawkerMatte } from '@/features/background-removal';
import { DEFAULT_BACKDROPS, renderEnamelPanel } from '@/features/enamel-backdrop';
import { GILDING_PRESETS } from '@/features/gilded-portrait';
import { AVATAR_SIZE, composeAvatar, composeLayers, cutOutSubject } from './compose';
import { type AvatarComposition } from './types';

const photo_p4 = buildHawkerFrame();
const matte_p4 = buildHawkerMatte();
const backdropSpec_p4 = DEFAULT_BACKDROPS[0].spec;
function composition_p4(overrides: Partial<AvatarComposition> = {}): AvatarComposition {
  return {
    photo: photo_p4, crop: HAWKER_CROP, matte: matte_p4, tuning: DEFAULT_TUNING, finish: 'natural',
    gilding: GILDING_PRESETS[0].params, backdrop: backdropSpec_p4, frame: 'medallion', size: 64, ...overrides,
  };
}
describe('compose guards', () => {
  it('treats a backdrop with no metal plane as ungilded', () => {
    const subject = cutOutSubject({ ...composition_p4(), size: 64 });
    const backdrop = renderEnamelPanel(backdropSpec_p4, 64);
    const withMetal = composeLayers({ subject, backdrop, frame: 'medallion', rampId: backdropSpec_p4.rampId });
    const withoutMetal = composeLayers({
      subject,
      backdrop: { image: backdrop.image },
      frame: 'medallion',
      rampId: backdropSpec_p4.rampId,
    });
    // Metal falls to zero where the backdrop has none, so the two differ.
    expect(withoutMetal.metal.data.some((value, index) => value !== withMetal.metal.data[index])).toBe(true);
  });

  it('composes at the house avatar size when none is given', () => {
    const { size: _ignored, ...withoutSize } = composition_p4();
    const image = composeAvatar(withoutSize);
    expect(image.width).toBe(AVATAR_SIZE);
    expect(image.height).toBe(AVATAR_SIZE);
  });
});
