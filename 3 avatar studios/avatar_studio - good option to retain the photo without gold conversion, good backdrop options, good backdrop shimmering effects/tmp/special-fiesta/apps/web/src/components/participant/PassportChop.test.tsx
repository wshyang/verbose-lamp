import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CHOP_WORD, buildChop, type ChopSpec } from '../../lib/passport/chop.js';
import { CHOP_DIES, type ChopDieId } from '../../lib/passport/chopDies.js';
import { CELL } from '../../lib/passport/chopGeo.js';
import { PassportChop } from './PassportChop.js';

/**
 * ADR-241 and ADR-242 — the mark is drawn from its spec and from nothing else.
 *
 * These are rendering checks: that the word a participant reads is really there, that the tilt, the
 * gap, the second strike, the knockout and the pen all appear when the spec says so and only then,
 * and that two chops in one list do not reach into each other's filters. Whether a die *looks*
 * like a stamp is judged by eye in a browser, in the sheets under `docs/design/`.
 */

/** The first seed in a small range whose impression on this die satisfies the predicate. */
function specWith(
  dieId: ChopDieId,
  predicate: (chop: ChopSpec) => boolean,
  from: number = 1,
): ChopSpec {
  for (let seed = from; seed < from + 2000; seed += 1) {
    const chop = buildChop(seed, dieId, 'Beach Dash');
    if (predicate(chop)) return chop;
  }
  throw new Error(`no seed on ${dieId} matches the predicate`);
}

const hasGap = (chop: ChopSpec): boolean => chop.artwork.frame?.dash !== undefined;
const hasGhost = (chop: ChopSpec): boolean => chop.ghost !== null;

function renderMark(chop: ChopSpec): HTMLElement {
  return render(<PassportChop chop={chop} />).container;
}

function textContents(container: Element): string[] {
  return Array.from(container.querySelectorAll('text')).map((node) => node.textContent ?? '');
}

describe('ADR-241 — the passport chop mark', () => {
  it('is labelled with the word it says, on every die', () => {
    for (const die of CHOP_DIES) {
      const mark = renderMark(buildChop(4242, die.id, 'Beach Dash')).querySelector('svg') as SVGSVGElement;
      expect(mark).toHaveAccessibleName(CHOP_WORD);
      expect(textContents(mark)).toContain(CHOP_WORD);
    }
  });

  it('keeps a stacked repeat silent for assistive technology when told to', () => {
    const chop = buildChop(99, 'ica-band', 'Beach Dash');
    const loud = renderMark(chop).querySelector('svg');
    expect(loud?.getAttribute('role')).toBe('img');
    expect(loud?.getAttribute('aria-hidden')).toBeNull();

    const quiet = render(<PassportChop chop={chop} decorative />).container.querySelector('svg');
    expect(quiet?.getAttribute('aria-hidden')).toBe('true');
    expect(quiet?.getAttribute('role')).toBeNull();
  });

  it('carries the station’s name as type, not as an image', () => {
    const container = renderMark(buildChop(17, 'thick-frame', 'Sandcastle Relay'));
    expect(textContents(container)).toContain('SANDCASTLE RELAY');
  });

  it('is drawn into the cell every die shares', () => {
    const container = renderMark(buildChop(3, 'ica-band', 'Beach Dash'));
    const expected = `${-CELL.width / 2} ${-CELL.height / 2} ${CELL.width} ${CELL.height}`;
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe(expected);
  });

  it('says which die it was struck with, for a test or a design sheet', () => {
    for (const die of CHOP_DIES) {
      const container = renderMark(buildChop(5, die.id, 'Beach Dash'));
      expect(container.querySelector('svg')?.getAttribute('data-die')).toBe(die.id);
    }
  });

  it('turns and skews the impression by the amounts its spec gives', () => {
    const chop = buildChop(4242, 'hex-customs', 'Beach Dash');
    const turned = renderMark(chop).querySelector('g[transform]')?.getAttribute('transform') ?? '';
    expect(turned).toContain(`rotate(${chop.placement.rotation})`);
    expect(turned).toContain(`skewX(${chop.placement.skew})`);
  });

  it('breaks the outer ring only for an impression whose die missed an edge', () => {
    const gapped = renderMark(specWith('union-circle', hasGap));
    const whole = renderMark(specWith('union-circle', (chop) => !hasGap(chop)));
    expect(gapped.querySelector('path[stroke-dasharray]')).not.toBeNull();
    expect(whole.querySelector('path[stroke-dasharray]')).toBeNull();
  });

  it('strikes a second, fainter copy only for an impression whose spec has one', () => {
    const struck = renderMark(specWith('ica-band', hasGhost));
    const single = renderMark(specWith('ica-band', (chop) => !hasGhost(chop)));
    expect(struck.querySelectorAll('use')).toHaveLength(2);
    expect(single.querySelectorAll('use')).toHaveLength(1);
  });

  it('punches the type out of a panel only for a die that has a panel', () => {
    for (const dieId of ['slab-knockout', 'thick-frame'] as ChopDieId[]) {
      const container = renderMark(buildChop(8, dieId, 'Beach Dash'));
      const holes = container.querySelectorAll('mask text');
      expect(holes.length).toBeGreaterThan(0);
      const knockout = container.querySelector('mask[id$="-knock"]') as Element;
      expect(knockout.querySelector('rect')?.getAttribute('fill')).toBe('#ffffff');
      expect(holes[0]?.getAttribute('fill')).toBe('#000000');
      expect(container.querySelector('path[mask]')).not.toBeNull();
    }
    const printed = renderMark(buildChop(8, 'ica-band', 'Beach Dash'));
    expect(printed.querySelector('mask text')).toBeNull();
    expect(printed.querySelector('path[mask]')).toBeNull();
  });

  it('runs the small print along a curve for the round dies and only for them', () => {
    const round = renderMark(buildChop(8, 'crown-oval', 'Beach Dash'));
    const curved = round.querySelector('textPath');
    expect(curved?.getAttribute('startOffset')).toBe('50%');
    const pathId = curved?.getAttribute('href')?.replace('#', '') as string;
    expect(round.querySelector(`defs path[id="${pathId}"]`)).not.toBeNull();
    expect(renderMark(buildChop(8, 'ica-band', 'Beach Dash')).querySelector('textPath')).toBeNull();
  });

  it('finishes the pen die in the pen’s colour and every other die in ink', () => {
    const pen = buildChop(4, 'brackets-pen', 'Beach Dash');
    const strokes = Array.from(renderMark(pen).querySelectorAll('path'))
      .map((path) => path.getAttribute('stroke'))
      .filter((stroke) => stroke !== null && stroke !== 'currentColor' && stroke !== 'none');
    expect(strokes).toContain(pen.penInk);
    for (const path of renderMark(buildChop(4, 'ica-band', 'Beach Dash')).querySelectorAll('path')) {
      expect(['currentColor', 'none', null]).toContain(path.getAttribute('stroke'));
    }
  });

  it('gives each mark in a list its own filters, so two chops cannot share one mask', () => {
    const { container } = render(
      <div>
        {CHOP_DIES.map((die) => (
          <PassportChop key={die.id} chop={buildChop(12, die.id, 'Beach Dash')} />
        ))}
      </div>,
    );
    const ids = Array.from(container.querySelectorAll('[id]')).map((node) => node.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('draws the same mark from the same spec on every render', () => {
    // React's own id counter moves between mounts, and ids are the only thing that may.
    const perInstanceIds = (html: string): string =>
      html.replace(/r[0-9a-z]+-(edge|mask|pressure|die|knock|arc\d+)/gu, 'u-$1');
    for (const die of CHOP_DIES) {
      const chop = buildChop(777, die.id, 'Beach Dash');
      expect(perInstanceIds(renderMark(chop).innerHTML)).toBe(perInstanceIds(renderMark(chop).innerHTML));
    }
  });
});
