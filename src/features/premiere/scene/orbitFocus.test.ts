import { describe, expect, it } from 'vitest';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import type { ChapterWindow } from './choreography';
import { orbitFocus } from './orbitFocus';

// Round numbers keep the 0.42 / 0.85 fractions exact in floating point.
const chapter: ChapterWindow = { startTime: 0, endTime: 100, zPosition: -26 };

describe('orbitFocus', () => {
  it('aims the orbit camera at the chapter depth from the signature offset', () => {
    const focus = orbitFocus(chapter, 50);
    expect(focus.target).toEqual([0, 0, -26]);
    expect(focus.cameraPosition).toEqual([2.4, 0.9, -16.8]);
  });

  it('retimes into the hold when the playhead is before or after it', () => {
    expect(orbitFocus(chapter, 10).holdAt).toBeCloseTo(56, 10);
    expect(orbitFocus(chapter, 95).holdAt).toBeCloseTo(56, 10);
  });

  it('leaves playback alone inside the hold window, boundaries included', () => {
    expect(orbitFocus(chapter, 42).holdAt).toBeNull();
    expect(orbitFocus(chapter, 60).holdAt).toBeNull();
    expect(orbitFocus(chapter, 85).holdAt).toBeNull();
  });

  it('matches the manager behaviour on a real chapter', () => {
    // Act III (14.0–20.8 s, z −52): entering orbit at its start holds at 56 %.
    const focus = orbitFocus(SEQUENCE_CHAPTERS[2], 14);
    expect(focus.holdAt).toBeCloseTo(17.808, 10);
    expect(focus.target).toEqual([0, 0, -52]);
    expect(focus.cameraPosition).toEqual([2.4, 0.9, -42.8]);
  });
});
