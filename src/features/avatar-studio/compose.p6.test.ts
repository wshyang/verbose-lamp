// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { DEFAULT_BACKDROPS, renderEnamelPanel } from '@/features/enamel-backdrop';
import { composeLayers, outlineRing, emptySubject } from './compose';

describe('composeAvatar', () => {
  it('offers a transparent subject so the backdrop can be previewed first', () => {
    const subject = emptySubject(8);

    expect(subject.pixels.data.every((value) => value === 0)).toBe(true);
    expect(subject.alpha.data.every((value) => value === 0)).toBe(true);
    expect(subject.shine).toBe(0);
    expect(outlineRing(subject.alpha).data.every((value) => value === 0)).toBe(true);
  });

  it('refuses layers that do not share one square size', () => {
    const backdrop = renderEnamelPanel(DEFAULT_BACKDROPS[0].spec, 16);

    expect(() =>
      composeLayers({
        backdrop,
        subject: emptySubject(8),
        rampId: 'bright',
        frame: 'plaque',
      })
    ).toThrow(RangeError);
    expect(() =>
      composeLayers({ backdrop, subject: emptySubject(8), rampId: 'bright', frame: 'plaque' })
    ).toThrow('Backdrop and subject layers must share one square size.');
  });
});
