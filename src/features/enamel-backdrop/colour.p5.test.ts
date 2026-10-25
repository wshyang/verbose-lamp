// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';

import { parseHexColour } from './colour';

describe('parseHexColour', () => {
  it('parses full hex colours with or without the hash', () => {
    expect(parseHexColour('#0f5c4a')).toEqual([15, 92, 74]);
    expect(parseHexColour(' A1B2C3 ')).toEqual([161, 178, 195]);
  });

  it('falls back to black for anything that is not a full hex colour', () => {
    for (const bad of ['emerald', '#12345', '#1234567', '', '#gg0000']) {
      expect(parseHexColour(bad), bad).toEqual([0, 0, 0]);
    }
  });
});
