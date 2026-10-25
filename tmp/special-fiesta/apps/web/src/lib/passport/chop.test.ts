import { describe, expect, it } from 'vitest';
import { CHOP_WORD, buildChop, type ChopSpec } from './chop.js';
import type { Dash } from './chopArtwork.js';
import { CHOP_DIES, dieById, type ChopDie, type ChopDieId } from './chopDies.js';
import { seededRandom } from './chopRandom.js';

/**
 * ADR-241 and ADR-242 — an impression is a pure function of one seed on one die.
 *
 * What the device keeps is a number (ADR-240), so these tests are the reason that is enough: the
 * same seed draws the same mark, a different seed draws a different one, and every die is held to
 * the ranges it declares — which is what stops a new design from quietly ignoring its own wear.
 */

const SAMPLE = 40;

function impressionsFor(dieId: ChopDieId, count: number = SAMPLE, offset: number = 0): ChopSpec[] {
  return Array.from({ length: count }, (_unused, index) =>
    buildChop(index + 1 + offset, dieId, 'Beach Dash'),
  );
}

/** Each number a die may vary, read off an impression and looked up in the die's own ranges. */
const FIELDS: {
  label: string;
  read: (chop: ChopSpec) => number;
  range: (die: ChopDie) => readonly [number, number];
}[] = [
  { label: 'rotation', read: (chop) => chop.placement.rotation, range: (die) => die.ranges.rotation },
  { label: 'skew', read: (chop) => chop.placement.skew, range: (die) => die.ranges.skew },
  { label: 'scale', read: (chop) => chop.placement.scale, range: (die) => die.ranges.scale },
  { label: 'offset x', read: (chop) => chop.placement.dx, range: (die) => die.ranges.dx },
  { label: 'offset y', read: (chop) => chop.placement.dy, range: (die) => die.ranges.dy },
  { label: 'ink opacity', read: (chop) => chop.inkOpacity, range: (die) => die.ranges.inkOpacity },
  { label: 'edge frequency', read: (chop) => chop.edge.frequency, range: (die) => die.ranges.edgeFrequency },
  { label: 'edge roughness', read: (chop) => chop.edge.scale, range: (die) => die.ranges.edgeScale },
  { label: 'starve scale', read: (chop) => chop.starve.frequency, range: (die) => die.ranges.starveFrequency },
  { label: 'starve threshold', read: (chop) => chop.starve.threshold, range: (die) => die.ranges.starveThreshold },
  { label: 'pressure floor', read: (chop) => chop.pressure.floor, range: (die) => die.ranges.pressureFloor },
];

function wordsOf(chop: ChopSpec): string[] {
  const { lettering, knocked, arcs } = chop.artwork;
  return [...lettering, ...knocked, ...arcs].map((line) => line.content);
}

describe('ADR-241 — the chop is a pure function of its seed', () => {
  it('draws the same impression from the same seed and the same die, every time', () => {
    expect(buildChop(90210, 'hex-customs', 'Beach Dash')).toEqual(buildChop(90210, 'hex-customs', 'Beach Dash'));
  });

  it('draws a different impression from each seed', () => {
    const drawn = new Set(impressionsFor('ica-band', 300).map((chop) => JSON.stringify(chop)));
    expect(drawn.size).toBe(300);
  });

  it('draws a different mark from one seed on a different die', () => {
    const marks = new Set(CHOP_DIES.map((die) => JSON.stringify(buildChop(5, die.id, 'Beach Dash').artwork)));
    expect(marks.size).toBe(CHOP_DIES.length);
  });

  it('keeps the seed it was drawn from, as a whole unsigned number', () => {
    expect(buildChop(7, 'ica-band', 'Beach Dash').seed).toBe(7);
    expect(buildChop(-1, 'ica-band', 'Beach Dash').seed).toBe(4294967295);
  });

  it('is built on mulberry32, so a stored seed keeps its meaning across releases of this file', () => {
    // The reference value of mulberry32 for seed 1. If this changes, every device's chops change
    // with it, because only the seed is kept on the device (ADR-240).
    expect(seededRandom(1)()).toBeCloseTo(0.62707394058819, 12);
  });

  it('says the one word on every die, in live text', () => {
    for (const die of CHOP_DIES) {
      for (const chop of impressionsFor(die.id, 5)) {
        expect(wordsOf(chop)).toContain(CHOP_WORD);
      }
    }
  });

  it('names the station the die was cut for, upper-cased for the small print', () => {
    for (const die of CHOP_DIES) {
      const chop = buildChop(3, die.id, 'beach   Dash');
      expect(wordsOf(chop)).toContain('BEACH DASH');
    }
  });

  it('gives the word its own height and turn per letter', () => {
    for (const die of CHOP_DIES) {
      for (const chop of impressionsFor(die.id, 4)) {
        const word = [...chop.artwork.lettering, ...chop.artwork.knocked].find(
          (line) => line.content === CHOP_WORD,
        ) as ChopSpec['artwork']['lettering'][number];
        expect(word.y).toHaveLength(CHOP_WORD.length);
        expect(word.rotate).toHaveLength(CHOP_WORD.length);
      }
    }
  });
});

describe('ADR-242 — each die is held to its own ranges', () => {
  it('keeps every impression inside the range its die declares', () => {
    for (const die of CHOP_DIES) {
      for (const field of FIELDS) {
        const [low, high] = field.range(die);
        for (const chop of impressionsFor(die.id, 6)) {
          expect(field.read(chop), `${die.id} ${field.label}`).toBeGreaterThanOrEqual(low);
          expect(field.read(chop), `${die.id} ${field.label}`).toBeLessThanOrEqual(high);
        }
      }
    }
  });

  it('reaches the width of the range it declares, so the ranges are not decoration', () => {
    for (const die of CHOP_DIES) {
      for (const field of FIELDS) {
        const [low, high] = field.range(die);
        const read = impressionsFor(die.id, 200).map(field.read);
        expect(Math.max(...read) - Math.min(...read), `${die.id} ${field.label}`).toBeGreaterThanOrEqual(
          (high - low) * 0.6,
        );
      }
    }
  });

  it('draws its ink from its own palette, and its pen from a pen it was given', () => {
    const colours = new Set<string>();
    for (const die of CHOP_DIES) {
      for (const chop of impressionsFor(die.id, 6)) {
        expect(die.inks).toContain(chop.ink);
        if (die.pen === null) expect(chop.penInk).toBe(chop.ink);
        else expect(die.pen).toContain(chop.penInk);
        colours.add(chop.ink);
      }
    }
    // The point of the catalogue is that the offices do not all use the same pad.
    expect(colours.size).toBeGreaterThanOrEqual(8);
  });

  it('gaps the outer ring only on the dies that have one, and never for a quarter of it', () => {
    for (const die of CHOP_DIES) {
      const chops = impressionsFor(die.id, 200);
      const open = chops.filter((chop) => chop.artwork.frame?.dash !== undefined);
      if (die.ranges.gapChance === 0) {
        expect(open).toHaveLength(0);
        continue;
      }
      expect(open.length).toBeGreaterThan(0);
      expect(open.length).toBeLessThan(chops.length);
      for (const chop of open) {
        const { dash } = chop.artwork.frame as { dash: Dash };
        expect(dash.off).toBeGreaterThan(0);
        expect(dash.off).toBeLessThanOrEqual(dash.on * (0.25 / 0.75) + 1e-9);
        expect(dash.on + dash.off).toBeCloseTo((chop.artwork.frame as { perimeter: number }).perimeter, 6);
      }
    }
  });

  it('strikes twice on some impressions and once on others, as each die’s chances say', () => {
    for (const die of CHOP_DIES) {
      const ghosts = impressionsFor(die.id, 200).filter((chop) => chop.ghost !== null);
      expect(ghosts.length).toBeGreaterThan(0);
      expect(ghosts.length).toBeLessThan(200);
      for (const ghost of ghosts.map((chop) => chop.ghost)) {
        expect(Math.abs(ghost?.dx as number)).toBeLessThanOrEqual(3);
        expect(ghost?.opacity).toBeGreaterThanOrEqual(0.12);
        expect(ghost?.opacity).toBeLessThanOrEqual(0.22);
      }
    }
  });

  it('hands the die back to whoever asks, and refuses a die that does not exist', () => {
    expect(dieById('slab-knockout').label).toBe('Over-inked slab');
    expect(() => dieById('no-such-die' as ChopDieId)).toThrow(/no chop die is registered/u);
  });

  it('names the die it used, which is how a design sheet labels its rows', () => {
    for (const die of CHOP_DIES) {
      const chop = buildChop(9, die.id, 'Beach Dash');
      expect(chop.die).toBe(die.id);
      expect(chop.dieLabel).toBe(die.label);
    }
  });

  it('leaves an open frame alone, since there is nothing there to gap', () => {
    const open = CHOP_DIES.filter((die) => die.ranges.gapChance === 0);
    expect(open.length).toBeGreaterThan(0);
    for (const die of open) {
      expect(
        impressionsFor(die.id, 30).every((chop) => chop.artwork.frame?.dash === undefined),
      ).toBe(true);
    }
  });
});
