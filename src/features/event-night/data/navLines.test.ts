import { describe, expect, it } from 'vitest';
import { DEFAULT_NAV_LINES } from './navLines';

describe('DEFAULT_NAV_LINES', () => {
  it('seeds the nav with the lucky-draw line', () => {
    expect(DEFAULT_NAV_LINES.split('\n')).toHaveLength(5);
    expect(DEFAULT_NAV_LINES).toContain('Lucky Draw');
  });
});
