import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNewMessageBoundary } from './useNewMessageBoundary.js';
import { advanceFeedMark, forgetFeedMarks, NO_MARKS } from '../storage/feedReadStore.js';

/**
 * ADR-163 — where the "new messages" line goes.
 *
 * The rules are small and each one of them is a decision somebody could reasonably have made
 * differently, so they are pinned individually rather than through the two panels. The panels
 * then only have to prove they rendered what this returned.
 */

function msg(id: string, createdAt: string) {
  return { id, createdAt };
}

/** Three lines a minute apart, which is enough to put a mark between any two of them. */
const HISTORY = [
  msg('a', '2026-10-05T09:00:00.000Z'),
  msg('b', '2026-10-05T09:01:00.000Z'),
  msg('c', '2026-10-05T09:02:00.000Z'),
];

beforeEach(() => {
  forgetFeedMarks();
});

afterEach(() => {
  forgetFeedMarks();
  vi.restoreAllMocks();
});

describe('useNewMessageBoundary', () => {
  it('draws the line above the first message newer than the mark', () => {
    advanceFeedMark('chat', '2026-10-05T09:00:30.000Z', NO_MARKS);

    const { result } = renderHook(() => useNewMessageBoundary('chat', HISTORY));

    expect(result.current.boundaryId).toBe('b');
  });

  it('draws no line when everything is older than the mark', () => {
    advanceFeedMark('chat', '2026-10-05T23:00:00.000Z', NO_MARKS);

    const { result } = renderHook(() => useNewMessageBoundary('chat', HISTORY));

    expect(result.current.boundaryId).toBeNull();
  });

  /*
   * A mark exactly equal to a message's time means that message has been read — the mark IS a
   * watermark the reader was shown, not the instant before it. Off by one here puts the line
   * above a line they have already seen, every single time they open a room they are caught up
   * on, which is the most common visit there is.
   */
  it('treats a message whose time equals the mark as already read', () => {
    advanceFeedMark('chat', '2026-10-05T09:01:00.000Z', NO_MARKS);

    const { result } = renderHook(() => useNewMessageBoundary('chat', HISTORY));

    expect(result.current.boundaryId).toBe('c');
  });

  /*
   * The room opens on the newest fifty. If every one of them is new, the line belongs at the
   * top with the read history behind `Earlier messages` — this is NOT the same as having read
   * nothing, which is the case below.
   */
  it('puts the line above the first loaded message when the whole page is new', () => {
    advanceFeedMark('chat', '2026-10-05T08:00:00.000Z', NO_MARKS);

    const { result } = renderHook(() => useNewMessageBoundary('chat', HISTORY));

    expect(result.current.boundaryId).toBe('a');
  });

  /* Nothing is known to have been read, so there is nothing to separate it from. */
  it('draws no line for a device with no mark for this feed', () => {
    const { result } = renderHook(() => useNewMessageBoundary('chat', HISTORY));

    expect(result.current.boundaryId).toBeNull();
  });

  it('reads the mark of the feed it was asked about, not another one', () => {
    advanceFeedMark('teamChat', '2026-10-05T09:00:30.000Z', NO_MARKS);

    const { result } = renderHook(() => useNewMessageBoundary('chat', HISTORY));

    expect(result.current.boundaryId).toBeNull();
  });

  /**
   * The behaviour the organiser asked for in so many words: the line stays where the reader
   * found it for the whole visit.
   *
   * This is also the hook's one real hazard. Opening a room clears its dot, which advances the
   * stored mark — so a version that re-read storage on each render would answer "nothing is
   * new" from the second render onwards and the line would vanish while being looked at.
   */
  it('holds the line still when the stored mark moves under it', () => {
    advanceFeedMark('chat', '2026-10-05T09:00:30.000Z', NO_MARKS);
    const { result, rerender } = renderHook(() => useNewMessageBoundary('chat', HISTORY));
    expect(result.current.boundaryId).toBe('b');

    // Exactly what `markFeedRead` does the moment the room absorbs.
    advanceFeedMark('chat', '2026-10-05T09:02:00.000Z', { ...NO_MARKS, chat: '2026-10-05T09:00:30.000Z' });
    rerender();

    expect(result.current.boundaryId).toBe('b');
  });

  /*
   * ADR-267 — the reported bug. A caught-up reader sends a message; it is absorbed with a
   * timestamp newer than the frozen mark, and the old comparison drew the line directly
   * above the line they had just written. Absorbing is reading (ADR-083): nothing that
   * lands during the visit can be unread, the sender's own message least of all.
   */
  it('draws no line above a message that arrives after the entry load', () => {
    advanceFeedMark('chat', '2026-10-05T09:02:00.000Z', NO_MARKS);
    const { result, rerender } = renderHook(
      ({ messages }: { messages: readonly { id: string; createdAt: string }[] }) =>
        useNewMessageBoundary('chat', messages),
      { initialProps: { messages: HISTORY } },
    );
    expect(result.current.boundaryId).toBeNull();

    // Exactly what sending does: the room absorbs a newer line.
    rerender({ messages: [...HISTORY, msg('d', '2026-10-05T09:03:00.000Z')] });

    expect(result.current.boundaryId).toBeNull();
  });

  /* The line the reader found is not pushed down by what arrives underneath it. */
  it('holds the line still when newer messages arrive during the visit', () => {
    advanceFeedMark('chat', '2026-10-05T09:00:30.000Z', NO_MARKS);
    const { result, rerender } = renderHook(
      ({ messages }: { messages: readonly { id: string; createdAt: string }[] }) =>
        useNewMessageBoundary('chat', messages),
      { initialProps: { messages: HISTORY } },
    );
    expect(result.current.boundaryId).toBe('b');

    rerender({ messages: [...HISTORY, msg('d', '2026-10-05T09:03:00.000Z')] });

    expect(result.current.boundaryId).toBe('b');
  });

  /*
   * Earlier history is older than the horizon by construction, so loading it can still
   * extend the line upwards over unread lines the opening page had not reached.
   */
  it('climbs the line when earlier unread history is loaded behind it', () => {
    advanceFeedMark('chat', '2026-10-05T08:59:00.000Z', NO_MARKS);
    const { result, rerender } = renderHook(
      ({ messages }: { messages: readonly { id: string; createdAt: string }[] }) =>
        useNewMessageBoundary('chat', messages),
      { initialProps: { messages: HISTORY.slice(1) } },
    );
    expect(result.current.boundaryId).toBe('b');

    rerender({ messages: HISTORY });

    expect(result.current.boundaryId).toBe('a');
  });

  /*
   * The horizon waits for the entry load: pinned at the seeded cache, it would fence out
   * the away-messages the catch-up delta is about to land (and those DO get the line).
   */
  it('pins the horizon when the load settles, not at the first list it sees', () => {
    advanceFeedMark('chat', '2026-10-05T09:00:30.000Z', NO_MARKS);
    const { result, rerender } = renderHook(
      ({ messages, settled }: { messages: readonly { id: string; createdAt: string }[]; settled: boolean }) =>
        useNewMessageBoundary('chat', messages, settled),
      { initialProps: { messages: HISTORY.slice(0, 1), settled: false } },
    );
    expect(result.current.boundaryId).toBeNull();

    // The settled list includes a line the reader had not seen: the line is drawn for it.
    rerender({ messages: HISTORY, settled: true });

    expect(result.current.boundaryId).toBe('b');
  });

  /* A room that settles empty gives arrivals during the visit no line to sit under. */
  it('keeps a room that settled empty line-free as messages arrive', () => {
    advanceFeedMark('chat', '2026-10-05T09:00:30.000Z', NO_MARKS);
    const { result, rerender } = renderHook(
      ({ messages }: { messages: readonly { id: string; createdAt: string }[] }) =>
        useNewMessageBoundary('chat', messages),
      { initialProps: { messages: [] as readonly { id: string; createdAt: string }[] } },
    );
    expect(result.current.boundaryId).toBeNull();

    rerender({ messages: [msg('d', '2026-10-05T09:03:00.000Z')] });

    expect(result.current.boundaryId).toBeNull();
  });

  it('re-places the line on the next visit, at the new boundary', () => {
    advanceFeedMark('chat', '2026-10-05T09:01:00.000Z', NO_MARKS);
    const first = renderHook(() => useNewMessageBoundary('chat', HISTORY));
    expect(first.result.current.boundaryId).toBe('c');
    first.unmount();

    advanceFeedMark('chat', '2026-10-05T09:02:00.000Z', { ...NO_MARKS, chat: '2026-10-05T09:01:00.000Z' });
    const second = renderHook(() => useNewMessageBoundary('chat', HISTORY));

    expect(second.result.current.boundaryId).toBeNull();
  });
});

describe('the landing scroll', () => {
  it('brings the line to the top of the view when it is attached', () => {
    advanceFeedMark('chat', '2026-10-05T09:00:30.000Z', NO_MARKS);
    const { result } = renderHook(() => useNewMessageBoundary('chat', HISTORY));
    const scrollIntoView = vi.fn();
    const node = { scrollIntoView } as unknown as HTMLElement;

    result.current.boundaryRef(node);

    // `start`, not `center`: everything below the line is the new material, so the reader
    // should be able to read downwards from it without scrolling back.
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
  });

  /*
   * Once per visit. The ref callback fires again on every re-render that remounts the node,
   * and a line that yanked the view back each time a message arrived would make the room
   * unusable precisely when it is busy.
   */
  it('does not drag the reader back a second time', () => {
    advanceFeedMark('chat', '2026-10-05T09:00:30.000Z', NO_MARKS);
    const { result } = renderHook(() => useNewMessageBoundary('chat', HISTORY));
    const scrollIntoView = vi.fn();
    const node = { scrollIntoView } as unknown as HTMLElement;

    result.current.boundaryRef(node);
    result.current.boundaryRef(null);
    result.current.boundaryRef(node);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  /* jsdom has no layout and therefore no `scrollIntoView`; the line must still render. */
  it('survives a browser that cannot scroll an element into view', () => {
    advanceFeedMark('chat', '2026-10-05T09:00:30.000Z', NO_MARKS);
    const { result } = renderHook(() => useNewMessageBoundary('chat', HISTORY));

    expect(() => {
      result.current.boundaryRef({} as unknown as HTMLElement);
    }).not.toThrow();
  });
});
