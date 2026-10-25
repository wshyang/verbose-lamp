// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it, vi } from 'vitest';

import { validateEntries } from './entries';

import { pickWinner } from './pickWinner';

const ENTRIES = [
  { id: 'a', name: 'Alice' },
  { id: 'b', name: 'Bertie' },
  { id: 'c', name: 'Clara' },
] as const;
describe('pickWinner', () => {
  it('uses injected entropy at the fairness boundary', () => {
    const fill = vi.fn((buf: Uint32Array) => {
      buf[0] = 2;
      return buf;
    });
    expect(pickWinner(ENTRIES, fill)).toBe(ENTRIES[2]);
    expect(fill).toHaveBeenCalledOnce();
  });

  it('defaults to crypto entropy and always returns a pool member', () => {
    expect(ENTRIES).toContain(pickWinner(ENTRIES));
  });
});
describe('entry normalization edge cases', () => {
  it('drops blank subtitles while trimming ids and names', () => {
    const result = validateEntries([
      { id: ' a ', name: ' Alice   Smith ', subtitle: '   ' },
      { id: 'b', name: 'Bertie', subtitle: ' Guest ' },
    ]);
    expect(result).toEqual({
      ok: true,
      entries: [
        { id: 'a', name: 'Alice Smith', subtitle: undefined },
        { id: 'b', name: 'Bertie', subtitle: 'Guest' },
      ],
    });
  });
});
