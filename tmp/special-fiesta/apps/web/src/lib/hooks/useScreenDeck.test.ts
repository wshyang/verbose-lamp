import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DASH_MAX_MS,
  DASH_PER_FRAME_MS,
  INTERRUPT_FLOOR_MS,
  PENDING_ALERT_MS,
  SCENE_TRANSITION_MS,
  useScreenDeck,
  type SceneInput,
} from './useScreenDeck.js';

/**
 * ADR-141 — the deck is a strip of frames, and the screen is a window sliding along it.
 *
 * Every rule here is invisible on a happy path and obvious at 15:40 with four courts
 * finishing at once, which is exactly why they are tests rather than intentions. The floor
 * is written first: without it, the busiest minute of the event is the minute the screen
 * becomes unreadable.
 */

const scenes = (ready: Record<string, boolean> = {}): SceneInput[] =>
  [
    { id: 'board', dwellMs: 15_000 },
    { id: 'individuals', dwellMs: 12_000 },
    { id: 'oncourt', dwellMs: 12_000 },
    { id: 'finished', dwellMs: 10_000 },
    { id: 'upnext', dwellMs: 12_000 },
  ].map((scene) => ({ ...scene, isReady: ready[scene.id] ?? true }));

function mount(input: SceneInput[] = scenes()) {
  return renderHook((props: SceneInput[]) => useScreenDeck(props), { initialProps: input });
}

/** Walk the clock far enough to finish a dwell AND the slide that follows it. */
function settle(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('the cruise', () => {
  it('rests on the first frame and slides one frame at a time, in one direction', () => {
    const { result } = mount();
    expect(result.current.index).toBe(0);
    expect(result.current.motion).toBe('rest');

    settle(15_000);
    expect(result.current.index).toBe(1);
    expect(result.current.motion).toBe('cruise');

    // The slide itself is a state the strip is in, not an instant: the frame being left is
    // still on screen for its duration, which is the whole visual idea.
    settle(SCENE_TRANSITION_MS);
    expect(result.current.motion).toBe('rest');

    settle(12_000);
    expect(result.current.index).toBe(2);
  });

  it('wraps by continuing forward onto a trailing copy of the first frame, never by rewinding', () => {
    const { result } = mount();
    for (const dwellMs of [15_000, 12_000, 12_000, 10_000]) {
      settle(dwellMs);
      settle(SCENE_TRANSITION_MS);
    }
    expect(result.current.index).toBe(4);

    settle(12_000);
    // The strip keeps moving LEFT into frame 5 — the clone — and only then jumps home with no
    // transition. A projector that rewinds four frames to get back to the start reads as a
    // mistake; this reads as a loop.
    expect(result.current.index).toBe(5);
    expect(result.current.isWrapping).toBe(true);

    settle(SCENE_TRANSITION_MS);
    expect(result.current.index).toBe(0);
    expect(result.current.isWrapping).toBe(false);
    expect(result.current.motion).toBe('rest');
  });
});

describe('the alert dash', () => {
  it('dashes to the alerted frame, then comes back and resumes from where it was', () => {
    const { result } = mount();
    settle(15_000 + SCENE_TRANSITION_MS); // now resting on frame 1 (individuals)
    expect(result.current.index).toBe(1);

    act(() => result.current.alert('finished'));
    expect(result.current.index).toBe(3);
    expect(result.current.motion).toBe('dash');

    // A dash is faster than a cruise and scales with the distance it covers, so two frames
    // and five frames are both read as "something happened over there".
    expect(result.current.slideMs).toBe(Math.min(DASH_MAX_MS, 2 * DASH_PER_FRAME_MS));

    settle(result.current.slideMs);
    expect(result.current.motion).toBe('rest');

    // It holds the alerted frame for that frame's own dwell, then returns the way it came.
    settle(10_000);
    expect(result.current.motion).toBe('return');
    expect(result.current.index).toBe(1);

    settle(result.current.slideMs);
    expect(result.current.motion).toBe('rest');

    // ...and the cycle picks up from the frame it was on, not from the start of the strip.
    settle(12_000);
    expect(result.current.index).toBe(2);
  });

  it('ignores a second alert inside the floor — four courts finishing is one jump, not four', () => {
    const { result } = mount();
    act(() => result.current.alert('finished'));
    expect(result.current.index).toBe(3);
    settle(result.current.slideMs);

    act(() => result.current.alert('board'));
    // Still on the alerted frame: the second alert is inside the floor and was dropped.
    expect(result.current.index).toBe(3);

    // Once the floor has passed, the screen is available to be called away again. (By now the
    // dash has long since returned of its own accord, which is the point of the floor: it
    // bounds how often the room can drag the screen around, not what it shows.)
    settle(INTERRUPT_FLOOR_MS);
    act(() => result.current.alert('upnext'));
    expect(result.current.index).toBe(4);
  });

  it('does not dash to the frame it is already showing', () => {
    const { result } = mount();
    act(() => result.current.alert('board'));
    expect(result.current.index).toBe(0);
    expect(result.current.motion).toBe('rest');
  });

  it('does not move for an alert about a frame that is not on the strip', () => {
    const { result } = mount(scenes({ finished: false }));
    act(() => result.current.alert('finished'));
    expect(result.current.motion).toBe('rest');
    expect(result.current.index).toBe(0);
  });

  it('holds that alert and delivers it the moment the scene joins the strip', () => {
    // The ordinary way a result arrives: the match that fills the Just Finished scene is the
    // same match the alert is about, and if the strip happened to be mid-slide when it landed
    // the scene could not join until the slide ended. Dropping the alert there would mean the
    // screen ignores precisely the results that arrive while it is already moving.
    const { result, rerender } = mount(scenes({ finished: false }));
    act(() => result.current.alert('finished'));
    act(() => rerender(scenes()));
    expect(result.current.index).toBe(3);
    expect(result.current.motion).toBe('dash');
  });

  it('forgets a held alert that has gone stale rather than reporting old news', () => {
    const { result, rerender } = mount(scenes({ finished: false }));
    act(() => result.current.alert('finished'));
    // Four minutes later the scene finally fills. The room has long since moved on, and a
    // screen whipping sideways now is reporting something nobody is still waiting for.
    settle(PENDING_ALERT_MS + 1_000);
    const before = result.current.index;
    act(() => rerender(scenes()));
    expect(result.current.index).toBe(before);
    expect(result.current.motion).not.toBe('dash');
  });
});

describe('what is on the strip', () => {
  it('does not restart the dwell every time the data behind it refreshes', () => {
    const { result, rerender } = mount();
    settle(14_000);
    // A poll lands one second before the strip was going to move. The scenes are the same
    // scenes, so the clock they are waiting on must be the same clock — otherwise every
    // refresh postpones the slide and the screen never moves at all.
    act(() => rerender(scenes()));
    settle(1_000);
    expect(result.current.index).toBe(1);
  });


  it('leaves an empty scene out entirely — a projector never shows "nothing yet"', () => {
    const { result } = mount(scenes({ individuals: false }));
    expect(result.current.frames.map((frame) => frame.id)).toEqual([
      'board',
      'oncourt',
      'finished',
      'upnext',
    ]);
    settle(15_000);
    expect(result.current.frames[result.current.index]?.id).toBe('oncourt');
  });

  it('rejoins a scene that fills up, but only while the strip is at rest', () => {
    const { result, rerender } = mount(scenes({ finished: false }));
    expect(result.current.frames).toHaveLength(4);

    // Mid-slide the strip is a laid-out row of pixels; inserting a frame into it would move
    // the ground under the animation. The new scene waits for the next moment of rest.
    settle(15_000);
    expect(result.current.motion).toBe('cruise');
    act(() => rerender(scenes()));
    expect(result.current.frames).toHaveLength(4);

    settle(SCENE_TRANSITION_MS);
    expect(result.current.frames).toHaveLength(5);
    // And it is still looking at the same scene it was looking at, not at whatever has slid
    // into that slot now that the strip is one frame longer.
    expect(result.current.frames[result.current.index]?.id).toBe('individuals');
  });

  it('follows its scene sideways when a frame ahead of it leaves the strip', () => {
    const { result, rerender } = mount();
    settle(15_000);
    settle(SCENE_TRANSITION_MS);
    settle(12_000);
    settle(SCENE_TRANSITION_MS);
    expect(result.current.frames[result.current.index]?.id).toBe('oncourt');

    // The board empties out — a correction voided the only scored match. Everything shuffles
    // one slot left, and the window has to shuffle with it or the room sees the screen jump
    // to a different scene without a single pixel having moved.
    act(() => rerender(scenes({ board: false })));
    expect(result.current.index).toBe(1);
    expect(result.current.frames[result.current.index]?.id).toBe('oncourt');
  });

  it('keeps going when the frame under it disappears', () => {
    const { result, rerender } = mount();
    settle(15_000 + SCENE_TRANSITION_MS);
    expect(result.current.frames[result.current.index]?.id).toBe('individuals');

    act(() => rerender(scenes({ individuals: false })));
    expect(result.current.frames).toHaveLength(4);
    // The index is re-anchored rather than left pointing at whatever slid into that slot.
    expect(result.current.frames[result.current.index]?.id).toBe('oncourt');
  });

  it('holds still rather than dividing by zero when every scene is empty', () => {
    const { result } = mount(
      scenes({ board: false, individuals: false, oncourt: false, finished: false, upnext: false }),
    );
    expect(result.current.frames).toHaveLength(0);
    settle(60_000);
    expect(result.current.index).toBe(0);
    expect(result.current.motion).toBe('rest');
  });
});
