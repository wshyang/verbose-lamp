// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { createPremiereStore } from './premiereStore';

describe('createPremiereStore', () => {
  it('clamps setTime into the sequence', () => {
    const store = createPremiereStore();
    store.getState().setTime(-1);
    expect(store.getState().currentTime).toBe(0);
    store.getState().setTime(99);
    expect(store.getState().currentTime).toBeCloseTo(37.999, 10);
  });

  it('jumps land 0.15 s into the clamped chapter', () => {
    const store = createPremiereStore();
    store.getState().jumpToChapter(2);
    expect(store.getState().currentTime).toBe(14.15);
    store.getState().jumpToChapter(-1);
    expect(store.getState().currentTime).toBe(0.15);
    store.getState().jumpToChapter(99);
    expect(store.getState().currentTime).toBe(27.65);
  });
});
