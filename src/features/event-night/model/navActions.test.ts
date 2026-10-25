import { describe, expect, it } from 'vitest';
import { DEFAULT_TAGLINE, SECTION_TAGLINES } from '../data/sectionTaglines';
import { resolveNavAction, taglineFor } from './navActions';

describe('resolveNavAction', () => {
  it('opens the lucky draw for any label that mentions the draw', () => {
    expect(resolveNavAction('Lucky Draw')).toEqual({ kind: 'open-draw' });
    expect(resolveNavAction('  the DRAW  ')).toEqual({ kind: 'open-draw' });
  });

  it('turns every other label into a section keyed by its lowercase name', () => {
    expect(resolveNavAction('Foyer')).toEqual({ kind: 'section', key: 'foyer', rainConfetti: false });
    expect(resolveNavAction('Gallery')).toEqual({ kind: 'section', key: 'gallery', rainConfetti: false });
  });

  it('rains confetti for the toast section only', () => {
    expect(resolveNavAction('Toast')).toEqual({ kind: 'section', key: 'toast', rainConfetti: true });
    expect(resolveNavAction('Program')).toMatchObject({ rainConfetti: false });
  });
});

describe('taglineFor', () => {
  it('returns the Gatsby tagline for the named sections', () => {
    for (const key of Object.keys(SECTION_TAGLINES)) {
      expect(taglineFor(key)).toBe(SECTION_TAGLINES[key]);
    }
  });

  it('falls back to the default tagline for an unknown section', () => {
    expect(taglineFor('afterparty')).toBe(DEFAULT_TAGLINE);
  });
});
