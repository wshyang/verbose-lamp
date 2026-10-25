import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCENE_VERSION } from './art/sceneVersion.js';
import { TessensohnScene, resetIntro } from './TessensohnScene.js';

/** ADR-299 — the CSC backdrop: its structure, its URLs, and the once-per-page-load entrances. */

const scene = (): HTMLElement => document.querySelector<HTMLElement>('[data-testid="venue-scene"]') as HTMLElement;

/** jsdom has no matchMedia: say whether the screen is landscape, and hold still. */
function screenIs(shape: 'portrait' | 'landscape'): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: shape === 'landscape' && query.includes('min-aspect-ratio'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

describe('the Tessensohn backdrop (ADR-299)', () => {
  beforeEach(() => {
    resetIntro();
    screenIs('portrait');
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('is decoration: hidden from assistive tech, as a full-height plate', () => {
    render(<TessensohnScene />);

    expect(scene().getAttribute('aria-hidden')).toBe('true');
    expect(scene().getAttribute('data-fit')).toBe('plate');
    expect(scene().className).toContain('venue-scene--tessensohn');
  });

  it('draws every image from the venue directory with the content stamp, and none from elsewhere', () => {
    render(<TessensohnScene />);
    const sources = [...scene().querySelectorAll('img')].map((img) => img.getAttribute('src') ?? '');

    expect(sources.length).toBeGreaterThan(60);
    for (const src of sources) {
      expect(src).toMatch(new RegExp(`^/themes/tessensohn/scene/[\\w-]+\\.(svg|png)\\?v=${SCENE_VERSION}$`));
    }
  });

  it('gives every image an empty alt, so none is read aloud', () => {
    render(<TessensohnScene />);

    for (const img of scene().querySelectorAll('img')) expect(img.getAttribute('alt')).toBe('');
  });

  it('puts the court, the car and the building in', () => {
    render(<TessensohnScene />);

    expect(scene().querySelector('[data-testid="venue-scene__court"]')).not.toBeNull();
    expect(scene().querySelector('[data-testid="venue-scene__car"]')).not.toBeNull();
    expect(scene().querySelector('.csc-building')).not.toBeNull();
  });

  it('draws the court after the second ground layer, on the sand at the bottom left, under the later foreground layers', () => {
    render(<TessensohnScene />);
    const order = [...scene().children].map((el) => el.getAttribute('data-testid') ?? el.className);
    const court = order.indexOf('venue-scene__court');
    const grounds = order.reduce<number[]>((all, name, i) => (name === 'csc-ground' ? [...all, i] : all), []);

    expect(grounds).toHaveLength(2);
    expect(court).toBe((grounds[1] ?? -1) + 1);
  });

  it('plays the entrances on the first scene of a page load and holds them at rest after', () => {
    render(<TessensohnScene />);
    expect(scene().getAttribute('data-intro')).toBe('play');
    cleanup();

    render(<TessensohnScene />);
    expect(scene().getAttribute('data-intro')).toBe('rest');
  });

  it('plays them again after a fresh page load', () => {
    render(<TessensohnScene />);
    cleanup();
    resetIntro();

    render(<TessensohnScene />);

    expect(scene().getAttribute('data-intro')).toBe('play');
  });

  describe('on a landscape screen (CSC\'s desktop banner)', () => {
    beforeEach(() => screenIs('landscape'));

    it('draws the wide composition as a bottom strip, not a centred portrait plate', () => {
      render(<TessensohnScene />);

      expect(scene().getAttribute('data-layout')).toBe('wide');
      expect(scene().hasAttribute('data-fit')).toBe(false);
    });

    it('has no separate badminton court group: the court is part of CSC\'s wide art', () => {
      render(<TessensohnScene />);

      expect(scene().querySelector('[data-testid="venue-scene__court"]')).toBeNull();
      expect(scene().querySelector('.csc-court')).not.toBeNull();
    });

    it('draws every image from the venue directory with the stamp', () => {
      render(<TessensohnScene />);
      const sources = [...scene().querySelectorAll('img')].map((img) => img.getAttribute('src') ?? '');

      expect(sources.length).toBeGreaterThan(100);
      for (const src of sources) {
        expect(src).toMatch(new RegExp(`^/themes/tessensohn/scene/[\\w-]+\\.(svg|png)\\?v=${SCENE_VERSION}$`));
      }
    });
  });

  it('is the phone composition on a portrait screen', () => {
    render(<TessensohnScene />);

    expect(scene().getAttribute('data-layout')).toBe('phone');
    expect(scene().getAttribute('data-fit')).toBe('plate');
  });
});
