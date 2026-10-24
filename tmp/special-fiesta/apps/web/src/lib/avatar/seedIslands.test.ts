import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseAvatarSprite } from '@psd/contracts';
import { describe, expect, it } from 'vitest';
import { componentSizesOf, DEFAULT_TUNING, pruneIslands } from './cutOut.js';

/**
 * ADR-072 — the prune, tried against eighty real photographs instead of hand-drawn grids.
 *
 * `cutOut.test.ts` states the rule on 16×16 fixtures. This states that the rule survives contact
 * with the recorded crowd, whose sprites came out of the studio with a real MODNET matte behind
 * them — including `Wei_Ling`, whose avatar carries eighty cells of the person sitting at the table
 * behind her, floating in the backdrop with no path to her face.
 *
 * Deliberately shaped to hold either way round. It never asserts that islands *exist*, so a future
 * re-record that ships a clean dump leaves it green rather than inverted; what it pins is that
 * wherever a detached piece is found, the default prune removes it and the person survives intact.
 */

interface DumpRow {
  nickname: string;
  avatarPhoto: string | null;
}

/**
 * The largest detached speck a recorded sprite may carry. Measured at 11 across the crowd; 16 leaves
 * a little room for a re-record to land differently without letting an eighty-cell foreign head back
 * in. Lower it if the post-quantisation strays are ever cleaned up at source.
 */
const STRAY_CELL_BUDGET = 16;

/**
 * Walk up for the dump rather than counting `..` segments: under jsdom `import.meta.url` is an
 * http URL, and the suite is run both from the repository root and from `apps/web`.
 */
function dumpPath(): string {
  const wanted = 'scripts/demo-participants.dump.json';
  let at = process.cwd();
  for (let up = 0; up < 6; up += 1) {
    const candidate = resolve(at, wanted);
    if (existsSync(candidate)) return candidate;
    at = dirname(at);
  }
  throw new Error(`could not find ${wanted} above ${process.cwd()}`);
}

const dump = JSON.parse(readFileSync(dumpPath(), 'utf8')) as { participants: DumpRow[] };

/**
 * The sprite read back as a background mask, the shape `pruneIslands` works in.
 *
 * `photoToSprite` always emits its palette as `[…photo colours, backdrop, ink]`, so the last two
 * indices are exactly the cells that are not the person (ADR-054 relies on the same ordering).
 */
function maskOf(sprite: string): { mask: Uint8Array; size: number } {
  const parsed = parseAvatarSprite(sprite);
  if (parsed === null) throw new Error('the dump holds a sprite that will not parse');
  const { size, rows, palette } = parsed;
  const colours = Object.keys(palette).length;
  const notPerson = new Set([(colours - 2).toString(16), (colours - 1).toString(16)]);
  const mask = new Uint8Array(size * size);
  rows.forEach((row, y) => {
    [...row].forEach((digit, x) => {
      mask[y * size + x] = notPerson.has(digit) ? 1 : 0;
    });
  });
  return { mask, size };
}

const wornPhotos = dump.participants.filter(
  (row): row is DumpRow & { avatarPhoto: string } => typeof row.avatarPhoto === 'string',
);

describe('the recorded crowd, under the default prune', () => {
  it('has photo avatars to examine at all', () => {
    expect(wornPhotos.length).toBeGreaterThan(0);
  });

  it('is left with exactly one piece of person per avatar, when pruned from the mask', () => {
    const stillBroken = wornPhotos.filter((row) => {
      const { mask, size } = maskOf(row.avatarPhoto);
      const pruned = pruneIslands(mask, size, DEFAULT_TUNING.minIsland);
      return componentSizesOf(pruned, size).length > 1;
    });

    expect(stillBroken.map((row) => row.nickname)).toEqual([]);
  });

  /*
   * And what the studio actually *ships*, which is not the same claim.
   *
   * The prune runs on the mask, before quantising. `despeckle` and the ink pass then run over the
   * painted grid and can strand a handful of cells that the prune never saw — so a recorded sprite is
   * not guaranteed to be a single piece even though its mask was. Measured on the re-recorded crowd:
   * 11 of 75 avatars carry a speck, the largest 11 cells.
   *
   * Bounded rather than forbidden, because a twelve-cell speck at 128×128 is invisible and predates
   * this work, while the defect this all exists for was eighty cells of somebody else's head. The
   * bound is what separates the two: a regression to a foreign object fails here, a quantisation
   * freckle does not.
   */
  it('ships no stray big enough to read as an object', () => {
    const tooBig = wornPhotos
      .map((row) => {
        const { mask, size } = maskOf(row.avatarPhoto);
        const [, ...strays] = componentSizesOf(mask, size);
        return { nickname: row.nickname, largest: Math.max(0, ...strays) };
      })
      .filter((row) => row.largest > STRAY_CELL_BUDGET);

    expect(tooBig).toEqual([]);
  });

  it('never takes a cell off the person while doing it', () => {
    const shrunk = wornPhotos.filter((row) => {
      const { mask, size } = maskOf(row.avatarPhoto);
      const before = componentSizesOf(mask, size)[0] ?? 0;
      const after = componentSizesOf(pruneIslands(mask, size, DEFAULT_TUNING.minIsland), size)[0] ?? 0;
      return after !== before;
    });

    expect(shrunk.map((row) => row.nickname)).toEqual([]);
  });

  it('leaves every avatar alone when asked to keep the strays', () => {
    const changed = wornPhotos.filter((row) => {
      const { mask, size } = maskOf(row.avatarPhoto);
      return [...pruneIslands(mask, size, 0)].join('') !== [...mask].join('');
    });

    expect(changed.map((row) => row.nickname)).toEqual([]);
  });
});
