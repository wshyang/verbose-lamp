import { describe, expect, it } from 'vitest';
import type { LuckyDrawEntry } from './entries';
import { pickWinner } from './pickWinner';

const GUESTS: LuckyDrawEntry[] = [
  { id: 'DAISY', name: 'Daisy Buchanan' },
  { id: 'Gatsby', name: 'Gatsby' },
  { id: 'Nick Carraway.', name: 'Nick Carraway' },
  { id: 'Tom', name: 'Tom Buchanan' },
  { id: 'Jordan', name: 'Jordan Baker' },
  { id: 'Myrtle', name: 'Myrtle Wilson' },
];

describe('pickWinner', () => {
  it('picks by the injected entropy source, never by the animation', () => {
    const fillWithSeven = (buf: Uint32Array) => {
      buf[0] = 7;
      return buf;
    };
    expect(pickWinner(GUESTS, fillWithSeven)).toBe(GUESTS[1]); // 7 % 6
  });

  it('defaults to crypto entropy and always lands on a guest', () => {
    for (let i = 0; i < 25; i += 1) {
      expect(GUESTS).toContain(pickWinner(GUESTS));
    }
  });
});
