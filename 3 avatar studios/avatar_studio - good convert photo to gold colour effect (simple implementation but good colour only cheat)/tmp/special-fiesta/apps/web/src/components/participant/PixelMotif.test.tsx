import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { PixelMotif } from './PixelMotif.js';
import { RoleMotif } from './RoleMotif.js';
import { MOTIF_NAMES, SHARED_MOTIF_NAMES, THEMED_MOTIF_NAMES } from '../../lib/motifs.js';
import { motifUrl } from '../../themes/motifUrl.js';
import { themeFor } from '../../themes/index.js';
import { MOTIF_ROLES } from '../../themes/types.js';

const sentosa = themeFor('sentosa');

describe('PixelMotif (ADR-014, ADR-297)', () => {
  it('renders a sized, decorative sprite', () => {
    const { container } = render(<PixelMotif name="kueh" size={32} className="gb-nav-icon" />);
    const image = container.querySelector('img');

    expect(image?.getAttribute('src')).toBe(
      `/themes/sentosa/motifs/kueh.svg?v=${sentosa.motifVersion}`,
    );
    expect(image?.getAttribute('width')).toBe('32');
    expect(image?.getAttribute('height')).toBe('32');
    expect(image?.className).toBe('gb-motif gb-nav-icon');
  });

  it('never announces itself to assistive tech', () => {
    const { container } = render(<PixelMotif name="trophy" size={16} className="" />);
    const image = container.querySelector('img');

    expect(image?.getAttribute('aria-hidden')).toBe('true');
    expect(image?.getAttribute('alt')).toBe('');
  });

  it('cannot be asked for a venue sprite — that is what roles are for', () => {
    // @ts-expect-error — `merlion` is a THEMED name; a page that names it is wrong the day the
    // venue is not Sentosa. This line failing to compile is the whole point of ADR-297.
    render(<PixelMotif name="merlion" size={16} className="" />);
  });

  it('points every shipped name at a sprite under the venue directory', () => {
    const urls = MOTIF_NAMES.map((name) => motifUrl(sentosa, name));

    expect(urls).toContain(`/themes/sentosa/motifs/trophy.svg?v=${sentosa.motifVersion}`);
    expect(new Set(urls).size).toBe(MOTIF_NAMES.length);
    expect(urls.every((url) => url.startsWith('/themes/sentosa/motifs/'))).toBe(true);
  });

  it('stamps the sprite version on every URL so a redraw is never served from cache', () => {
    // The stamp is generated from the SVGs themselves — see scripts/motifs/generate.mjs.
    expect(sentosa.motifVersion).toMatch(/^[0-9a-f]{8}$/);
    expect(motifUrl(sentosa, 'psd')).toBe(`/themes/sentosa/motifs/psd.svg?v=${sentosa.motifVersion}`);
  });
});

describe('the shared / themed split (ADR-297)', () => {
  it('puts every sprite in exactly one kind', () => {
    const shared = new Set<string>(SHARED_MOTIF_NAMES);

    expect(THEMED_MOTIF_NAMES.filter((name) => shared.has(name))).toEqual([]);
    expect(MOTIF_NAMES).toHaveLength(SHARED_MOTIF_NAMES.length + THEMED_MOTIF_NAMES.length);
  });
});

describe('RoleMotif (ADR-297)', () => {
  it('draws whichever sprite the active venue assigns to the role', () => {
    const { container } = render(<RoleMotif role="bannerMark" size={32} className="" />);

    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      `/themes/sentosa/motifs/${sentosa.motifRoles.bannerMark}.svg?v=${sentosa.motifVersion}`,
    );
  });

  it('is as decorative as a plain sprite', () => {
    const { container } = render(<RoleMotif role="landingHero" size={20} className="" />);
    const image = container.querySelector('img');

    expect(image?.getAttribute('aria-hidden')).toBe('true');
    expect(image?.getAttribute('alt')).toBe('');
  });

  it('has a sprite for every role in every venue', () => {
    // `Record<MotifRole, MotifName>` makes a missing role a compile error; this proves the mapped
    // sprite is one the app knows (shared or themed, ADR-298).
    for (const role of MOTIF_ROLES) {
      expect(MOTIF_NAMES, `${role}`).toContain(sentosa.motifRoles[role]);
    }
  });
});
