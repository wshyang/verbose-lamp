import { describe, expect, it } from 'vitest';
import { normalizeHeroTitle } from './normalizeHeroTitle';

describe('normalizeHeroTitle', () => {
  it('applies safe defaults to required fields and keeps optional lines blank', () => {
    expect(
      normalizeHeroTitle({
        keystone: ' ',
        preTitle: ' ',
        mainTitle: '',
        subCredit: ' ',
        pinstripeAlternation: false,
      })
    ).toEqual({
      keystone: 'THE',
      preTitle: '',
      mainTitle: 'GATSBY',
      subCredit: '',
      pinstripeAlternation: false,
    });
  });

  it('trims, uppercases, and enforces each title field limit', () => {
    expect(
      normalizeHeroTitle({
        keystone: '  a very long word ',
        preTitle: '  Great Gatsby Is Too Long  ',
        mainTitle: '  roaring twenties gala  ',
        subCredit: 'a'.repeat(50),
        pinstripeAlternation: true,
      })
    ).toEqual({
      keystone: 'A VERY L',
      preTitle: 'GREAT GATSBY IS TO',
      mainTitle: 'ROARING TWENTIES',
      subCredit: 'A'.repeat(46),
      pinstripeAlternation: true,
    });
  });
});