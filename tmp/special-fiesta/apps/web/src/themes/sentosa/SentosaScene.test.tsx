import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SentosaScene } from './SentosaScene.js';
import { PLAYER_PERIODS, SCENE_PARTS, SCENE_PARTS_FINE, SCENE_SIZE, SCENE_VERSION } from './art/pixelArt.js';
import { BACKDROP_KEY } from '../../lib/scene/backdropChoice.js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/*
 * The stylesheet is asserted on directly — the animations are half of this feature, and
 * jsdom applies none of them. Vitest blanks `?raw` CSS imports, so it is read from disk;
 * the workspace may be the cwd or the repo root depending on how the run was started.
 */
function readSource(relative: string): string {
  const path = [`src/${relative}`, `apps/web/src/${relative}`]
    .map((candidate) => resolve(process.cwd(), candidate))
    .find((candidate) => existsSync(candidate));
  return readFileSync(String(path), 'utf8');
}
// The scene's rules are split (ADR-294): the generic machinery in gameboy.css, what only this
// venue has (cable cars, Express, ferry) in its own scene.css. The animations are asserted over
// both, because a keyframe may be declared in one file and used in the other.
const genericCss = readSource('styles/gameboy.css');
const venueCss = readSource('themes/sentosa/scene.css');
const css = `${genericCss}\n${venueCss}`;

function renderScene(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/home${search}`]}>
      <SentosaScene />
    </MemoryRouter>,
  );
}

describe('SentosaScene (ADR-022, ADR-023)', () => {
  it('hands the whole scene over to the photoreal one for ?backdrop=real', () => {
    /*
     * ADR-200. A dispatch, not a third `parts` table: the real scene has eight players,
     * three different cable cars and a net drawn between them, none of which this
     * component's fixed z-order can express. So the assertion is that the pixel scene is
     * GONE, not that it has different files.
     */
    render(
      <MemoryRouter initialEntries={['/feed?backdrop=real']}>
        <SentosaScene />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('real-beach-scene')).toBeTruthy();
    expect(screen.queryByTestId('beach-scene')).toBeNull();
  });

  it('stacks the panorama and every moving part inside one decorative box', () => {
    const { getByTestId } = renderScene();
    const scene = getByTestId('beach-scene');

    expect(scene.getAttribute('aria-hidden')).toBe('true');
    // panorama, clouds, swell, surf, three cabins, the Express, the tree clump that hides
    // it, and the ball's two nested layers.
    expect(scene.querySelectorAll('.gb-scene__layer')).toHaveLength(11);
    // Sheets get a box of their own: gulls, two palm crowns, four players.
    expect(scene.querySelectorAll('.gb-scene__frame')).toHaveLength(7);
    expect(scene.querySelectorAll('[data-testid="beach-scene__cablecar"]')).toHaveLength(3);
  });

  it('anchors every cabin inside its paint box, with the off-frame travel in the transform', () => {
    // Regression: a negative background-position does not park a sprite off frame — it
    // clips it invisible for the whole loop, which is how the cable cars vanished.
    for (const parts of [SCENE_PARTS, SCENE_PARTS_FINE]) {
      const [x] = parts.cablecar.style.backgroundPosition.split(' ');
      expect(Number.parseFloat(String(x))).toBeGreaterThanOrEqual(0);
    }
    // The entry from off-left lives in the keyframes instead, where transforms may roam.
    expect(css).toContain('transform: translate(-4.167%, 0);');
    expect(css).toContain('transform: translate(103.125%, -24.565%);');
  });

  it('gives each cabin its own place on the cable', () => {
    const { getAllByTestId } = renderScene();
    const delays = getAllByTestId('beach-scene__cablecar').map((cabin) => cabin.style.animationDelay);

    expect(delays).toEqual(['0s', '-11s', '-22s']);
    expect(new Set(delays).size).toBe(3);
  });

  it('spreads the generated geometry so sprites stay glued to the panorama', () => {
    const { container } = renderScene();
    const panorama = container.querySelector<HTMLElement>('.gb-scene__panorama');
    const cabin = container.querySelector<HTMLElement>('.gb-scene__cablecar');
    const palm = container.querySelector<HTMLElement>('.gb-scene__palm');

    expect(panorama?.style.backgroundImage).toContain(SCENE_PARTS.panorama.src);
    expect(panorama?.style.backgroundSize).toBe('100% 100%');
    expect(cabin?.style.backgroundPosition).toBe(SCENE_PARTS.cablecar.style.backgroundPosition);
    // A sheet is boxed to exactly one frame at 200% — sized to the whole sheet it drew
    // both frames at once, which is how the palms grew a crown over the umbrella.
    expect(palm?.style.width).toBe(SCENE_PARTS.palmLeft.style.width);
    expect(palm?.style.left).toBe(SCENE_PARTS.palmLeft.style.left);
    // jsdom normalises the `auto` away; the sheet is still twice the box wide.
    expect(palm?.style.backgroundSize).toBe('200%');
  });

  it('puts four players on the court, each flipping on its own period', () => {
    const { getAllByTestId } = renderScene();
    const players = getAllByTestId('beach-scene__player');

    expect(players).toHaveLength(PLAYER_PERIODS.length);
    const periods = players.map((player) => player.style.getPropertyValue('--gb-period'));
    expect(periods).toEqual([...PLAYER_PERIODS]);
    expect(new Set(periods).size).toBe(PLAYER_PERIODS.length);
    // Feet on the sand in front of the net, not up in the sky or under the nav bar.
    for (const player of players) {
      const top = Number.parseFloat(player.style.top);
      expect(top).toBeGreaterThan(70);
      expect(top).toBeLessThan(83);
    }
  });

  it('swaps in the fine art on request and remembers the choice (ADR-023)', () => {
    const fine = renderScene('?backdrop=fine');
    expect(fine.container.querySelector<HTMLElement>('.gb-scene__panorama')?.style.backgroundImage)
      .toContain(SCENE_PARTS_FINE.panorama.src);
    expect(window.localStorage.getItem(BACKDROP_KEY)).toBe('fine');
    fine.unmount();

    // No parameter: the last deliberate switch still stands, so the comparison survives a
    // walk through the app.
    const remembered = renderScene();
    expect(remembered.container.querySelector<HTMLElement>('.gb-scene__panorama')?.style.backgroundImage)
      .toContain(SCENE_PARTS_FINE.panorama.src);
    remembered.unmount();

    const classic = renderScene('?backdrop=classic');
    expect(classic.container.querySelector<HTMLElement>('.gb-scene__panorama')?.style.backgroundImage)
      .toContain(SCENE_PARTS.panorama.src);
  });

  it('stamps every layer URL with the art version so a redraw is never served from cache', () => {
    const urls = Object.values(SCENE_PARTS).map((part) => part.src);
    const fineUrls = Object.values(SCENE_PARTS_FINE).map((part) => part.src);

    expect(SCENE_VERSION).toMatch(/^[0-9a-f]{8}$/);
    expect(urls.every((url) => url.startsWith('/themes/sentosa/scene/') && url.endsWith(`?v=${SCENE_VERSION}`))).toBe(true);
    expect(fineUrls.every((url) => url.startsWith('/themes/sentosa/scene-2x/'))).toBe(true);
    expect(new Set(urls).size).toBe(urls.length);
    expect(fineUrls).toHaveLength(urls.length);
    expect(SCENE_SIZE).toEqual({ width: 480, height: 270 });
  });

  it('shows the backdrop at handset widths and stops every animation for reduced motion', () => {
    /*
     * ADR-256 — the scene used to exist only above 760px, so no phone ever
     * rendered it (the Android report: a blue-and-yellow blank). It is now
     * unconditional: displayed, fixed and bottom-pinned with no width gate,
     * and the reduced-motion rules apply at every width too.
     */
    expect(css).not.toContain('@media (min-width: 760px)');
    expect(css).toContain('.gb-scene {\n  display: block;\n  position: fixed;');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');

    expect(genericCss).toContain('.gb-scene__layer,\n  .gb-scene__frame {\n    animation: none;');
    /*
     * Parked mid-air, a cabin or a train reads as broken art rather than as stillness, so
     * everything that TRAVELS is hidden outright rather than frozen. Asserted as membership
     * of the hidden rule rather than as its exact text, because the list grows: the ferry
     * joined it in ADR-196 and pinning the literal made that a test failure instead of the
     * correct answer.
     */
    const hidden = venueCss.slice(
      venueCss.indexOf('.gb-scene__cablecar,'),
      venueCss.indexOf('}', venueCss.indexOf('.gb-scene__cablecar,')),
    );
    for (const travels of ['cablecar', 'express', 'ferry']) {
      expect(hidden).toContain(`.gb-scene__${travels}`);
    }
    expect(hidden).toContain('display: none;');
  });

  it('declares a keyframe for every animation the scene asks for', () => {
    /*
     * Both spellings. A keyframe reached only through `animation-name` — which is how the
     * real backdrop swaps the cable's direction without restating the timing — is still a
     * keyframe in use, and reading only the shorthand reported it as dead.
     */
    const used = [...css.matchAll(/animation(?:-name)?:\s*([^;]+);/g)]
      .flatMap((match) => String(match[1]).split(','))
      .map((entry) => String(entry.trim().split(/\s+/)[0]))
      .filter((name) => name.startsWith('gb-scene-'));
    const declared = [...css.matchAll(/@keyframes\s+(gb-scene-[\w-]+)/g)].map((match) => String(match[1]));

    expect(used.length).toBeGreaterThan(0);
    expect(used.every((name) => declared.includes(name))).toBe(true);
    expect(declared.every((name) => used.includes(name))).toBe(true);
  });
});
