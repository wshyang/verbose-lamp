import { describe, expect, it } from 'vitest';
import {
  backgroundFromMatte,
  componentSizes,
  faceSeedIndex,
  keepSubjectPiece,
  pruneIslands,
  trimEdge,
} from './matte';
import type { AlphaMask } from '../types';

function matteOf(width: number, height: number, isSubject: (x: number, y: number) => boolean): AlphaMask {
  const data = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) data[y * width + x] = isSubject(x, y) ? 255 : 0;
  }
  return { width, height, data };
}

/** A grid of `size × size` cells where every cell is ground unless listed. */
function groundWith(size: number, subjectCells: readonly number[]): Uint8Array {
  const background = new Uint8Array(size * size).fill(1);
  for (const cell of subjectCells) background[cell] = 0;
  return background;
}

describe('the matte, reduced to the portrait grid', () => {
  it('calls a cell backdrop when the model says the photo behind it is ground', () => {
    const matte = matteOf(40, 40, (x) => x < 20);
    const background = backgroundFromMatte(matte, { x: 0, y: 0, size: 40 }, 40, 128);
    expect(background[0]).toBe(0);
    expect(background[39]).toBe(1);
  });

  it('treats the whole picture as backdrop when the model finds no subject', () => {
    const matte = matteOf(40, 40, () => false);
    const background = backgroundFromMatte(matte, { x: 0, y: 0, size: 40 }, 40, 128);
    expect(Array.from(background).every((cell) => cell === 1)).toBe(true);
  });

  it('reads the matte only inside the crop', () => {
    const matte = matteOf(40, 40, (x) => x < 20);
    const background = backgroundFromMatte(matte, { x: 20, y: 0, size: 20 }, 10, 128);
    expect(background[0]).toBe(1);
  });
});

describe('the pieces of the subject', () => {
  it('are counted largest first', () => {
    const background = groundWith(10, [0, 1, 99]);
    expect(componentSizes(background, 10)).toEqual([2, 1]);
  });

  it('have their detached specks pruned away', () => {
    const background = groundWith(10, [99]);
    const pruned = pruneIslands(background, 10, 4);
    expect(pruned[99]).toBe(1);
  });

  it('keep the main piece when the speck is pruned', () => {
    const background = groundWith(10, [0, 1, 2, 3, 4, 5, 6, 7, 99]);
    const pruned = pruneIslands(background, 10, 4);
    expect(pruned[0]).toBe(0);
    expect(pruned[99]).toBe(1);
  });

  it('keep the piece the face is standing in and drop the rest', () => {
    const background = groundWith(10, [0, 5]);
    const kept = keepSubjectPiece(background, 10, 5);
    expect(kept[5]).toBe(0);
    expect(kept[0]).toBe(1);
  });

  it('fall back to the largest piece when the seed misses', () => {
    const background = groundWith(10, [0, 1, 2, 50]);
    const kept = keepSubjectPiece(background, 10, 99);
    expect(kept[0]).toBe(0);
    expect(kept[50]).toBe(1);
  });
});

describe('the edge of the matte', () => {
  it('grows the subject by a cell when asked to grow it', () => {
    const background = groundWith(10, [55]);
    const grown = trimEdge(background, 10, 1);
    expect(grown[55]).toBe(0);
    expect(grown[56]).toBe(0);
  });

  it('shrinks the subject by a cell when asked to shrink it', () => {
    const background = groundWith(10, [55]);
    const shrunk = trimEdge(background, 10, -1);
    expect(shrunk[55]).toBe(1);
  });

  it('leaves the matte alone when asked for no change', () => {
    const background = groundWith(10, [55]);
    expect(Array.from(trimEdge(background, 10, 0))).toEqual(Array.from(background));
  });
});

describe('the seed of the subject', () => {
  it('stands between the eyes of a square grid', () => {
    expect(faceSeedIndex(64)).toBe(33 * 64 + 32);
  });
});
