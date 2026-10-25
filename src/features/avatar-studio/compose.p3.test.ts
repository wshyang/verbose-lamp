// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, HAWKER_CROP, buildHawkerFrame, buildHawkerMatte } from '@/features/background-removal';
import { DEFAULT_BACKDROPS, renderEnamelPanel } from '@/features/enamel-backdrop';
import { GILDING_PRESETS } from '@/features/gilded-portrait';
import { AVATAR_SIZE, composeAvatar, composeLayers, cutOutSubject, emptySubject } from './compose';
import { isStageBusy } from './stage';
import { type AvatarComposition } from './types';

const photo_p3 = buildHawkerFrame();
const matte_p3 = buildHawkerMatte();
const backdropSpec_p3 = DEFAULT_BACKDROPS[0].spec;
function composition_p3(overrides: Partial<AvatarComposition> = {}): AvatarComposition {
  return {
    photo: photo_p3, crop: HAWKER_CROP, matte: matte_p3, tuning: DEFAULT_TUNING, finish: 'natural',
    gilding: GILDING_PRESETS[0].params, backdrop: backdropSpec_p3, frame: 'medallion', size: 64, ...overrides,
  };
}
describe('avatar composition guards', () => {
  it('offers a transparent subject before a photo is chosen', () => {
    const subject = emptySubject(8);
    expect(subject.pixels.width).toBe(8);
    expect(subject.pixels.data.every((value) => value === 0)).toBe(true);
    expect(subject.alpha.data.every((value) => value === 0)).toBe(true);
    expect(subject.shine).toBe(0);
  });

  it('defaults the avatar to its 512 px square', () => {
    const avatar = composeAvatar(composition_p3({ size: undefined }));
    expect([avatar.width, avatar.height]).toEqual([AVATAR_SIZE, AVATAR_SIZE]);
  });

  it('refuses layers of different sizes', () => {
    const subject = cutOutSubject({ ...composition_p3(), size: 32 });
    const backdrop = renderEnamelPanel(backdropSpec_p3, 64);
    expect(() => composeLayers({ subject, backdrop, frame: 'medallion', rampId: 'bright' })).toThrow(
      RangeError,
    );
  });

  it('composites a backdrop with no metal layer', () => {
    const subject = cutOutSubject({ ...composition_p3(), size: 32 });
    const backdrop = { ...renderEnamelPanel(backdropSpec_p3, 32), metal: undefined } as never;
    const avatar = composeLayers({ subject, backdrop, frame: 'medallion', rampId: 'bright' });
    expect(avatar.image.data.length).toBe(32 * 32 * 4);
  });
});
describe('isStageBusy', () => {
  it('is true only while background work runs', () => {
    expect(isStageBusy('working')).toBe(true);
    expect(isStageBusy('refining')).toBe(true);
    expect(isStageBusy('idle')).toBe(false);
    expect(isStageBusy('ready')).toBe(false);
  });
});
