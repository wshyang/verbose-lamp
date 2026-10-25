import { describe, expect, it } from 'vitest';
import { shardUserIds } from './shard.js';

describe('shardUserIds — 300 across 4 workers, nobody lost', () => {
  it('splits contiguously, first shards bigger on the remainder, and loses nobody', () => {
    const shards = shardUserIds(300, 4);
    expect(shards.map((shard) => shard.length)).toEqual([75, 75, 75, 75]);
    expect(shards.flat()).toEqual(Array.from({ length: 300 }, (_, i) => i + 1));
    expect(shards[0]?.[0]).toBe(1);
    expect(shards[3]?.[74]).toBe(300);
  });

  it('spreads an uneven count without gaps or inventions', () => {
    const shards = shardUserIds(301, 4);
    expect(shards.map((shard) => shard.length)).toEqual([76, 75, 75, 75]);
    const seen = shards.flat().sort((a, b) => a - b);
    expect(seen).toEqual(Array.from({ length: 301 }, (_, i) => i + 1));
  });

  it('allows more shards than users, one shard, and zero users', () => {
    expect(shardUserIds(2, 4)).toEqual([[1], [2], [], []]);
    expect(shardUserIds(5, 1)).toEqual([[1, 2, 3, 4, 5]]);
    expect(shardUserIds(0, 3)).toEqual([[], [], []]);
  });

  it('refuses nonsense rather than inventing a split', () => {
    expect(() => shardUserIds(-1, 2)).toThrow();
    expect(() => shardUserIds(10, 0)).toThrow();
  });
});
