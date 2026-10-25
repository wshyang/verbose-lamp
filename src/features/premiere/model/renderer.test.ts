import { describe, expect, it } from 'vitest';
import { RENDERER_PARAM, parseRenderer } from './renderer';

describe('parseRenderer', () => {
  it('defaults to the React Three Fiber scene', () => {
    expect(parseRenderer('')).toBe('r3f');
    expect(parseRenderer('?freezeAt=4.32')).toBe('r3f');
    expect(RENDERER_PARAM).toBe('renderer');
  });

  it('selects the imperative renderer on request', () => {
    expect(parseRenderer('?renderer=classic')).toBe('classic');
    expect(parseRenderer('freezeAt=4.32&renderer=classic')).toBe('classic');
  });

  it('ignores an unknown renderer instead of failing to render', () => {
    expect(parseRenderer('?renderer=webgpu')).toBe('r3f');
    expect(parseRenderer('?renderer=')).toBe('r3f');
  });
});
