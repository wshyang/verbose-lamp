import { describe, expect, it } from 'vitest';
import { DEFAULT_RENDERER, RENDERER_PARAM, parseRenderer } from './renderer';

// While the imperative manager and the R3F port coexist (until the Phase 3 parity check),
// the URL picks which one mounts. The default is the manager: nothing changes for anyone
// who does not ask.
describe('parseRenderer', () => {
  it('names the query parameter renderer and defaults to the manager', () => {
    expect(RENDERER_PARAM).toBe('renderer');
    expect(DEFAULT_RENDERER).toBe('manager');
  });

  it.each(['', '?', '?hud=off', '?freezeAt=4', '?renderer=', '?renderer=unknown', '?Renderer=r3f'])(
    'keeps the manager for %j',
    (search) => {
      expect(parseRenderer(search)).toBe('manager');
    },
  );

  it.each([
    ['?renderer=r3f', 'r3f'],
    ['renderer=r3f', 'r3f'],
    ['?renderer=manager', 'manager'],
    ['?hud=off&renderer=r3f&freezeAt=4', 'r3f'],
    ['?renderer=%20r3f%20', 'r3f'],
  ] as const)('reads %j as %s', (search, expected) => {
    expect(parseRenderer(search)).toBe(expected);
  });

  it('uses the first value when the parameter repeats, as URLSearchParams does', () => {
    expect(parseRenderer('?renderer=r3f&renderer=manager')).toBe('r3f');
  });

  it('is case sensitive about the value, so a typo cannot silently opt in', () => {
    expect(parseRenderer('?renderer=R3F')).toBe('manager');
  });
});
