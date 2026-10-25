// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, HAWKER_CROP, buildHawkerFrame, buildHawkerMatte } from '@/features/background-removal';
import { DEFAULT_BACKDROPS, renderEnamelPanel } from '@/features/enamel-backdrop';
import { GILDING_PRESETS } from '@/features/gilded-portrait';
import { composeAvatar, composeLayers, cutOutSubject, emptySubject } from './compose';
import { type AvatarComposition } from './types';

const photo_p5 = buildHawkerFrame();
const matte_p5 = buildHawkerMatte();
const backdropSpec_p5 = DEFAULT_BACKDROPS[0].spec;
function composition_p5(overrides: Partial<AvatarComposition> = {}): AvatarComposition {
  return {
    photo: photo_p5, crop: HAWKER_CROP, matte: matte_p5, tuning: DEFAULT_TUNING, finish: 'natural',
    gilding: GILDING_PRESETS[0].params, backdrop: backdropSpec_p5, frame: 'medallion', size: 64, ...overrides,
  };
}
describe('composeLayers invariants', () => {
  it('rejects layers of different sizes', () => {
    const subject = cutOutSubject({ ...composition_p5(), size: 32 });
    const backdrop = renderEnamelPanel(backdropSpec_p5, 16);
    expect(() => composeLayers({ subject, backdrop, frame: 'plaque', rampId: 'bright' })).toThrow(RangeError);
  });

  it('composes against a panel that carries no metal layer', () => {
    const subject = cutOutSubject({ ...composition_p5(), size: 32 });
    const panel = renderEnamelPanel(backdropSpec_p5, 32);
    const bare = { ...panel, metal: undefined } as unknown as typeof panel;
    const avatar = composeLayers({ subject, backdrop: bare, frame: 'plaque', rampId: 'bright' });
    expect(avatar.image.width).toBe(32);
    expect(avatar.metal.data.length).toBe(32 * 32);
  });

  it('builds a fully transparent empty subject', () => {
    const empty = emptySubject(4);
    expect(empty.pixels.data.every((value) => value === 0)).toBe(true);
    expect(empty.alpha.data.every((value) => value === 0)).toBe(true);
    expect(empty.shine).toBe(0);
  });

  it('renders at the 512 default when the caller omits the size', () => {
    const { size: _size, ...rest } = composition_p5();
    const avatar = composeAvatar(rest);
    expect([avatar.width, avatar.height]).toEqual([512, 512]);
  });
});
