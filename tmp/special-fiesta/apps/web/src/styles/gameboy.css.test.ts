import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * ADR-265 — the participant theme's mobile behaviour is CSS, and jsdom applies none of
 * it, so the stylesheet is asserted on directly (the console.css.test.ts pattern):
 * the shell tracks the visible viewport on a phone, the portrait sky fills the space
 * ADR-256's full-art bargain leaves above the scene strip, and the pixel type steps
 * up at handset widths so the root page no longer reads as a zoomed-out desktop page.
 */

function read(name: string): string {
  return readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');
}

const css = read('./gameboy.css');
const base = read('./base.css');

/** The text between the first occurrence of `marker` and the next closing of its block. */
function blockAfter(text: string, marker: string): string {
  const start = text.indexOf(marker);
  expect(start, `expected to find ${marker}`).toBeGreaterThanOrEqual(0);
  const end = text.indexOf('\n}', start);
  return text.slice(start, end);
}

/** A whole @media block, inner rules and all, found by counting braces. */
function mediaBlock(text: string, marker: string): string {
  const start = text.indexOf(marker);
  expect(start, `expected to find ${marker}`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let at = text.indexOf('{', start); at < text.length; at += 1) {
    if (text[at] === '{') depth += 1;
    if (text[at] === '}') depth -= 1;
    if (depth === 0) return text.slice(start, at + 1);
  }
  throw new Error(`unterminated block after ${marker}`);
}

describe('participant shell on a phone (ADR-265)', () => {
  it('sizes the shell by the visible viewport, with the percentage as fallback', () => {
    const shell = blockAfter(css, '.theme-gameboy {');
    const percent = shell.indexOf('height: 100%;');
    const dynamic = shell.indexOf('height: 100dvh;');
    expect(percent).toBeGreaterThanOrEqual(0);
    // The dvh line must come second: it wins where supported, the percentage is the fallback.
    expect(dynamic).toBeGreaterThan(percent);
  });

  it('tells mobile browsers to use text sizes exactly as written', () => {
    expect(base).toContain('-webkit-text-size-adjust: 100%;');
    expect(base).toContain('text-size-adjust: 100%;');
  });
});

describe('the portrait sky (ADR-265)', () => {
  const portrait = blockAfter(css, '@media (orientation: portrait)');

  it('paints a fixed sky behind everything, only in portrait', () => {
    expect(portrait).toContain('.theme-gameboy:not(:has(.gb-scene[data-fit=\'plate\']))::before');
    expect(portrait).toContain('position: fixed;');
    expect(portrait).toContain('z-index: -1;');
    expect(portrait).toContain('pointer-events: none;');
    // The foot of the gradient is the panorama's top row, so the join is invisible.
    expect(portrait).toContain('var(--scene-sky) 100%');
    // Clouds are the pixel cloud motif, cache-stamped like every motif the CSS names.
    // The stylesheet names the role; the theme owns the sprite and its stamp (ADR-296).
    expect(portrait).toContain('var(--motif-cloud)');
    expect(read('../themes/sentosa/theme.css')).toContain(
      "--motif-cloud: url('/themes/sentosa/motifs/cloud.svg?v=f222a466')",
    );
  });

  it('drifts the clouds on a declared keyframe, and stops for reduced motion', () => {
    expect(css).toContain('@keyframes gb-scene-sky-drift');
    expect(portrait).toContain('animation: gb-scene-sky-drift 110s linear infinite;');
    const reduced = blockAfter(css, '@media (orientation: portrait) and (prefers-reduced-motion: reduce)');
    expect(reduced).toContain('.theme-gameboy:not(:has(.gb-scene[data-fit=\'plate\']))::before');
    expect(reduced).toContain('animation: none;');
  });

  it('leaves the scene strip itself alone — full art, bottom-pinned, at every width', () => {
    // ADR-256's bargain, asserted in SentosaScene.test.tsx as well: no width gate hides
    // the scene, and the portrait sky must not smuggle one back in.
    expect(css).not.toContain('@media (min-width: 760px)');
    expect(portrait).not.toContain('.gb-scene {');
  });
});

describe('the QR badge (ADR-266)', () => {
  it('gives the code the width of the card — it is scanned across a counter', () => {
    expect(blockAfter(css, '.gb-qr-essentials > .gb-qr-slot {')).toContain('flex: 0 1 min(320px, 76vw);');
  });

  // ADR-318 — width alone left the 4-digit number below the fold on a short phone.
  it('fits the code to the height that is left, inside a size container scoped to this page', () => {
    expect(css).toContain('.gb-main:has(.gb-qr-essentials) {');
    expect(blockAfter(css, '.gb-main:has(.gb-qr-essentials) {')).toContain('container-type: size;');
    expect(blockAfter(css, '.gb-qr-essentials {')).toContain('100cqh');
    expect(blockAfter(css, '.gb-qr-essentials > .gb-qr-slot {')).toContain('min-height: 120px;');
    const code = blockAfter(css, '.gb-qr {');
    expect(code).toContain('height: 100%;');
    expect(code).toContain('aspect-ratio: 1;');
  });
});

describe('the phone type scale (ADR-265)', () => {
  const phone = mediaBlock(css, '@media (max-width: 600px)');

  it('steps the reading face and the pixel type up below 600px', () => {
    expect(blockAfter(phone, '.theme-gameboy {')).toContain('font-size: 22px;');
    expect(blockAfter(phone, '.gb-banner h1 {')).toContain('font-size: 16px;');
    expect(blockAfter(phone, '.gb-banner p {')).toContain('font-size: 10px;');
    expect(blockAfter(phone, '.gb-panel h2 {')).toContain('font-size: 12px;');
    expect(blockAfter(phone, '.gb-panel h3 {')).toContain('font-size: 10px;');
    expect(blockAfter(phone, '.gb-label {')).toContain('font-size: 10px;');
    expect(blockAfter(phone, '.gb-button {')).toContain('font-size: 12px;');
  });

  // ADR-317 — a media query adds no specificity, so a block that precedes the rule it overrides
  // loses to it. Declared-in-the-block is not the same as winning.
  it.each(['.gb-banner h1', '.gb-banner p', '.gb-panel h2', '.gb-panel h3', '.gb-label', '.gb-button'])(
    'comes after the base rule for %s, or it never wins',
    (selector) => {
      const mediaAt = css.indexOf('@media (max-width: 600px)');
      const baseAt = css.indexOf(`\n${selector} {`);
      expect(baseAt, `expected a top-level ${selector} rule`).toBeGreaterThanOrEqual(0);
      expect(mediaAt).toBeGreaterThan(baseAt);
    },
  );

  it('keeps .gb-button--small after the phone block, so small buttons stay small', () => {
    expect(css.indexOf('\n.gb-button--small {')).toBeGreaterThan(css.indexOf('@media (max-width: 600px)'));
  });

  it('keeps the bottom nav at 8px — six pixel labels must still fit 320px (ADR-046)', () => {
    expect(phone).not.toContain('.gb-nav');
  });
});
