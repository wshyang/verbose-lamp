// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it, vi } from 'vitest';

import { type LuckyDrawEntry } from './entries';

import { pickWinner } from './pickWinner';

const entries: LuckyDrawEntry[] = [
  { id: 'a', name: 'Daisy' },
  { id: 'b', name: 'Nick' },
  { id: 'c', name: 'Jordan' },
];
describe('pickWinner', () => {
  it('maps the entropy buffer onto the entry list', () => {
    expect(pickWinner(entries, (buf) => (buf.fill(0), buf)).name).toBe('Daisy');
    expect(pickWinner(entries, (buf) => (buf.fill(1), buf)).name).toBe('Nick');
    expect(pickWinner(entries, (buf) => (buf.fill(7), buf)).name).toBe('Nick');
  });

  it('is uniform when the buffer is uniform (same odds per entry)', () => {
    const seen = new Map<string, number>();
    for (let i = 0; i < entries.length; i += 1) {
      const winner = pickWinner(entries, (buf) => (buf.fill(i), buf));
      seen.set(winner.id, (seen.get(winner.id) ?? 0) + 1);
    }
    expect([...seen.keys()].sort()).toEqual(['a', 'b', 'c']);
  });

  it('fills the buffer through the injected source, one draw per pick', () => {
    const fill = vi.fn((buf: Uint32Array) => (buf.fill(2), buf));

    pickWinner(entries, fill);

    expect(fill).toHaveBeenCalledTimes(1);
    expect(fill.mock.calls[0][0]).toBeInstanceOf(Uint32Array);
  });

  it('uses crypto entropy by default', () => {
    const spy = vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
      if (array instanceof Uint32Array) array.fill(1);
      return array;
    });

    expect(pickWinner(entries).name).toBe('Nick');
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });

  it('works for a single-entry draw', () => {
    expect(pickWinner([entries[0]], (buf) => (buf.fill(999), buf)).id).toBe('a');
  });
});
