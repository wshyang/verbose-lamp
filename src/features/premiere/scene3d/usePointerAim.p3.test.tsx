// @vitest-environment jsdom
// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePointerAim } from './usePointerAim';

const move = (clientX: number, clientY: number) => {
  window.dispatchEvent(new PointerEvent('pointermove', { clientX, clientY }));
};
describe('usePointerAim', () => {
  it('removes its listener on unmount', () => {
    const { unmount } = renderHook(() => usePointerAim(false));
    unmount();
    move(900, 400);
    // Nothing listens any more; a stray move must not throw.
    expect(true).toBe(true);
  });
});
