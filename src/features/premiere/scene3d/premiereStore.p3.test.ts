// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { createPremiereStore } from './premiereStore';

describe('createPremiereStore', () => {
  it('holds a frozen frame when asked', () => {
    const state = createPremiereStore({ freezeAt: 4.32 }).getState();
    expect(state.freezeAt).toBe(4.32);
    expect(state.currentTime).toBe(4.32);
    expect(state.isPlaying).toBe(false);
  });

  it('keeps the playhead inside the sequence', () => {
    const store = createPremiereStore();
    store.getState().setTime(-4);
    expect(store.getState().currentTime).toBe(0);
    store.getState().setTime(99);
    expect(store.getState().currentTime).toBeCloseTo(TOTAL_SEQUENCE_DURATION - 0.001, 6);
  });

  it('jumps 0.15 s into a chapter and clamps the index', () => {
    const store = createPremiereStore();
    store.getState().jumpToChapter(2);
    const chapter = SEQUENCE_CHAPTERS[2];
    expect(store.getState().currentTime).toBeCloseTo(chapter.startTime + 0.15);
    expect(store.getState().isPlaying).toBe(true);

    store.getState().jumpToChapter(-5);
    expect(store.getState().currentTime).toBeCloseTo(SEQUENCE_CHAPTERS[0].startTime + 0.15);

    store.getState().jumpToChapter(99);
    const last = SEQUENCE_CHAPTERS[SEQUENCE_CHAPTERS.length - 1];
    expect(store.getState().currentTime).toBeCloseTo(last.startTime + 0.15);
  });

  it('lands on the hold when a chapter is picked in orbit mode', () => {
    const store = createPremiereStore();
    store.getState().setCameraMode('orbit');
    store.getState().jumpToChapter(1);
    const chapter = SEQUENCE_CHAPTERS[1];
    const duration = chapter.endTime - chapter.startTime;
    expect(store.getState().currentTime).toBeCloseTo(chapter.startTime + duration * 0.56);
    expect(store.getState().isPlaying).toBe(false);
  });

  it('opens the orbit camera on the hold, and leaves the cinema playhead alone', () => {
    const store = createPremiereStore();
    store.getState().setTime(0);
    store.getState().setCameraMode('orbit');
    expect(store.getState().cameraMode).toBe('orbit');
    expect(store.getState().currentTime).toBeCloseTo(
      SEQUENCE_CHAPTERS[0].startTime +
        (SEQUENCE_CHAPTERS[0].endTime - SEQUENCE_CHAPTERS[0].startTime) * 0.56,
    );
    expect(store.getState().isPlaying).toBe(false);

    store.getState().setPlaying(true);
    store.getState().setCameraMode('cinema');
    expect(store.getState().cameraMode).toBe('cinema');
    expect(store.getState().isPlaying).toBe(true);
  });

  it('does not move a playhead that is already inside the orbit hold', () => {
    const store = createPremiereStore();
    const chapter = SEQUENCE_CHAPTERS[2];
    const inside = chapter.startTime + (chapter.endTime - chapter.startTime) * 0.6;
    store.getState().setTime(inside);
    store.getState().setCameraMode('orbit');
    expect(store.getState().currentTime).toBeCloseTo(inside);
  });
});
