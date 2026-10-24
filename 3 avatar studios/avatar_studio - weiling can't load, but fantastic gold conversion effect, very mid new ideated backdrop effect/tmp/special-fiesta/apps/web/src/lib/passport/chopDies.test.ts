import { describe, expect, it } from 'vitest';
import { CHOP_WORD, buildChop, type ChopSpec } from './chop.js';
import { CHOP_DIES, type ChopDie, type ChopDieId } from './chopDies.js';
import { CELL } from './chopGeo.js';
import { MAX_LABEL } from './chopType.js';
import { boundsOf } from '../../test-utils/pathData.js';

/**
 * ADR-242 — what every die in the catalogue owes, before anyone judges how it looks.
 *
 * A design is free to be a circle or a hexagon, heavy or faint. What it may not do is spill out of
 * the cell, drop the word, forget the station, set type too small to read at 120 px, or leave
 * itself without an ink. Those are the lines these tests hold, and they hold them for every die in
 * the catalogue at once, so adding a tenth design inherits the whole audit.
 */

const SEEDS = 24;

function impressionsFor(dieId: ChopDieId): ChopSpec[] {
  return Array.from({ length: SEEDS }, (_unused, index) =>
    buildChop(index * 613 + 7, dieId, 'Beach Dash'),
  );
}

function firstImpression(dieId: ChopDieId): ChopSpec {
  return impressionsFor(dieId)[0] as ChopSpec;
}

function linesOf(chop: ChopSpec): { content: string; size: number }[] {
  const { lettering, knocked, arcs } = chop.artwork;
  return [...lettering, ...knocked, ...arcs];
}

function shapesOf(chop: ChopSpec): { d: string }[] {
  const { frame, panels, paths } = chop.artwork;
  return [...(frame ? [frame] : []), ...panels, ...paths];
}

function ordered(range: readonly [number, number]): boolean {
  return range[0] < range[1];
}

const RANGE_FIELDS: (keyof ChopDie['ranges'])[] = [
  'rotation',
  'skew',
  'scale',
  'dx',
  'dy',
  'inkOpacity',
  'edgeFrequency',
  'edgeScale',
  'starveFrequency',
  'starveThreshold',
  'pressureFloor',
];

describe('ADR-242 — the catalogue', () => {
  it('registers every die once, named and referenced', () => {
    const ids = CHOP_DIES.map((die) => die.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(6);
    for (const die of CHOP_DIES) {
      expect(die.label.length).toBeGreaterThan(3);
      expect(die.note.length).toBeGreaterThan(20);
      expect(die.id).toMatch(/^[a-z][a-z-]+$/u);
    }
  });

  it('cuts each die for inks of its own, written as colours', () => {
    for (const die of CHOP_DIES) {
      expect(die.inks.length).toBeGreaterThan(0);
      for (const ink of [...die.inks, ...(die.pen ?? [])]) {
        expect(ink).toMatch(/^#[0-9a-f]{6}$/u);
      }
      if (die.pen !== null) expect(die.pen.length).toBeGreaterThan(0);
    }
    // Different offices keep different pads. One ink for the whole catalogue would be a bug.
    const inks = new Set(CHOP_DIES.flatMap((die) => [...die.inks]));
    expect(inks.size).toBeGreaterThanOrEqual(CHOP_DIES.length - 1);
  });

  it('declares ranges that run low to high, and chances that are chances', () => {
    for (const die of CHOP_DIES) {
      for (const field of RANGE_FIELDS) {
        expect(ordered(die.ranges[field] as readonly [number, number]), `${die.id}.${field}`).toBe(true);
      }
      for (const chance of [die.ranges.ghostChance, die.ranges.gapChance]) {
        expect(chance).toBeGreaterThanOrEqual(0);
        expect(chance).toBeLessThanOrEqual(1);
      }
      expect(die.ranges.starveThreshold[1]).toBeLessThan(0.5);
    }
  });
});

describe('ADR-242 — what every die owes', () => {
  it('says the word on every impression of every die', () => {
    for (const die of CHOP_DIES) {
      for (const chop of impressionsFor(die.id)) {
        expect(linesOf(chop).map((line) => line.content)).toContain(CHOP_WORD);
      }
    }
  });

  it('names the station on every impression of every die', () => {
    for (const die of CHOP_DIES) {
      for (const chop of impressionsFor(die.id)) {
        expect(linesOf(chop).map((line) => line.content)).toContain('BEACH DASH');
      }
    }
  });

  it('carries a printed serial on every die but the one dated in pen', () => {
    for (const die of CHOP_DIES) {
      const serials = linesOf(firstImpression(die.id)).filter((line) => /^NO \d{4}$/u.test(line.content));
      expect(serials.length, die.id).toBe(die.id === 'brackets-pen' ? 0 : 1);
    }
  });

  it('never sets type too small to read at the size the list draws it', () => {
    for (const die of CHOP_DIES) {
      for (const chop of impressionsFor(die.id)) {
        for (const line of [...chop.artwork.lettering, ...chop.artwork.knocked, ...chop.artwork.arcs]) {
          expect(line.size, `${die.id} small print`).toBeGreaterThanOrEqual(6.5);
        }
      }
    }
  });

  it('keeps every shape of every die inside the cell', () => {
    const halfWidth = CELL.width / 2;
    const halfHeight = CELL.height / 2;
    for (const die of CHOP_DIES) {
      for (const chop of impressionsFor(die.id)) {
        for (const shape of shapesOf(chop)) {
          const bounds = boundsOf(shape.d);
          expect(bounds.minX, `${die.id} x`).toBeGreaterThanOrEqual(-halfWidth);
          expect(bounds.maxX, `${die.id} x`).toBeLessThanOrEqual(halfWidth);
          expect(bounds.minY, `${die.id} y`).toBeGreaterThanOrEqual(-halfHeight);
          expect(bounds.maxY, `${die.id} y`).toBeLessThanOrEqual(halfHeight);
        }
        for (const line of [...chop.artwork.lettering, ...chop.artwork.knocked]) {
          expect(line.x).toBeGreaterThanOrEqual(-halfWidth);
          expect(line.x + line.length).toBeLessThanOrEqual(halfWidth);
          expect(Math.max(...line.y) + line.size * 0.3).toBeLessThanOrEqual(halfHeight);
          expect(Math.min(...line.y) - line.size * 0.75).toBeGreaterThanOrEqual(-halfHeight);
        }
      }
    }
  });

  it('draws nothing that cannot be parsed: no path is left with a NaN in it', () => {
    for (const die of CHOP_DIES) {
      for (const chop of impressionsFor(die.id)) {
        for (const shape of shapesOf(chop)) {
          expect(shape.d.includes('NaN')).toBe(false);
        }
        for (const arc of chop.artwork.arcs) expect(arc.path.includes('NaN')).toBe(false);
      }
    }
  });

  it('closes a ring on the dies that have one and leaves the open ones open', () => {
    const closed = CHOP_DIES.filter((die) => die.ranges.gapChance > 0);
    expect(closed.length).toBeGreaterThan(0);
    for (const die of closed) {
      for (const chop of impressionsFor(die.id)) {
        expect(chop.artwork.frame, die.id).not.toBeNull();
      }
    }
    for (const die of CHOP_DIES.filter((candidate) => candidate.ranges.gapChance === 0)) {
      expect(firstImpression(die.id).artwork.frame).toBeNull();
    }
  });

  it('curves the name only on the dies whose frame is a ring', () => {
    // Two of the nine put the office along a curve. The rest print it straight, because a line of
    // type set on an arc is harder to read than the same line on a band, and a die that has room
    // for a band should use it.
    const curved = CHOP_DIES.filter((die) => firstImpression(die.id).artwork.arcs.length > 0);
    expect(curved.map((die) => die.id)).toEqual(['union-circle', 'crown-oval']);
    for (const die of CHOP_DIES.filter((candidate) => !curved.includes(candidate))) {
      const arc = firstImpression(die.id).artwork.arcs;
      expect(arc, die.id).toHaveLength(0);
    }
  });

  it('shrinks a long station name to the same length on every die', () => {
    for (const die of CHOP_DIES) {
      const chop = buildChop(11, die.id, 'Sandcastle Relay Tournament Final Round');
      const label = linesOf(chop)
        .map((line) => line.content)
        .find((content) => content.endsWith('…'));
      expect(label, die.id).toBeDefined();
      expect(label?.length ?? 0).toBeLessThanOrEqual(MAX_LABEL);
      expect(label).toContain('SANDCASTLE');
    }
  });

  it('is nine different pieces of artwork, not one with nine labels', () => {
    const geometry = CHOP_DIES.map((die) => JSON.stringify(firstImpression(die.id).artwork.paths));
    expect(new Set(geometry).size).toBe(CHOP_DIES.length);
    const frames = CHOP_DIES.map((die) => firstImpression(die.id).artwork.frame?.d ?? 'open');
    expect(new Set(frames).size).toBeGreaterThanOrEqual(8);
  });
});
