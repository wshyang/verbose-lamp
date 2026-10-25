import { describe, expect, it } from 'vitest';
import { parseRendererMode, RENDERER_PARAM } from './rendererMode';

/**
 * The port ships behind a flag so the likeness baselines stay the default
 * (ADDENDUM-022 §6 step 2.5). If this parser ever defaults to `r3f`, every
 * screenshot test would change subject without anyone re-baselining on purpose.
 */
describe('parseRendererMode', () => {
  it('keeps the existing manager for a plain visit', () => {
    expect(parseRendererMode('')).toBe('manager');
    expect(parseRendererMode('?')).toBe('manager');
    expect(parseRendererMode('?freezeAt=12')).toBe('manager');
  });

  it('selects the React Three Fiber port for ?renderer=r3f', () => {
    expect(parseRendererMode('?renderer=r3f')).toBe('r3f');
    expect(parseRendererMode('renderer=r3f')).toBe('r3f');
    expect(parseRendererMode('?freezeAt=33.8&renderer=r3f')).toBe('r3f');
  });

  it('is forgiving about case and padding, and strict about the value', () => {
    expect(parseRendererMode(`?${RENDERER_PARAM}=%20R3F%20`)).toBe('r3f');
    expect(parseRendererMode('?renderer=r3f2')).toBe('manager');
    expect(parseRendererMode('?renderer=')).toBe('manager');
    expect(parseRendererMode('?renderer=manager')).toBe('manager');
  });
});
