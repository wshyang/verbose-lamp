import { describe, expect, it } from 'vitest';
import { COMPACT_VIEWPORT_WIDTH, panelStartsOpen } from './panelStart';

describe('panelStartsOpen', () => {
  it('opens the panel on a desktop width', () => {
    expect(panelStartsOpen(1440)).toBe(true);
  });

  it('leaves the panel collapsed on a phone', () => {
    expect(panelStartsOpen(390)).toBe(false);
  });

  it('treats the breakpoint itself as a desktop, so the comparison is not off by one', () => {
    expect(panelStartsOpen(COMPACT_VIEWPORT_WIDTH)).toBe(true);
    expect(panelStartsOpen(COMPACT_VIEWPORT_WIDTH - 1)).toBe(false);
  });
});
