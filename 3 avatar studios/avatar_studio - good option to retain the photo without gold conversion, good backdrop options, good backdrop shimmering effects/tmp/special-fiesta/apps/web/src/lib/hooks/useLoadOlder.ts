import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { scrollDownBy, scrollHeightOf, scrollParentOf } from '../scrollParent.js';

/**
 * ADR-065 — fetch older messages before the reader reaches the top, and don't move the page.
 *
 * Two problems, both of which have to be solved or the feature feels broken:
 *
 *   1. **Trigger early.** An `IntersectionObserver` on a sentinel above the list, with a generous
 *      `rootMargin`, fires while the sentinel is still off screen — so the page is already longer by
 *      the time the reader gets there. Waiting for an actual top-of-page scroll event would show
 *      them the end of the history and then move it.
 *   2. **Keep the reader's place.** Prepending pushes everything down, and the browser keeps
 *      `scrollY`, so without anchoring the content appears to jump by the height of the new page.
 *      The document height is measured before the prepend and the difference is added back after
 *      paint, which leaves what they were reading exactly where it was.
 *
 * Since ADR-098 the participant shell scrolls inside `.gb-main`, so the anchor works on the
 * nearest scroll container of the list — falling back to the document where pages still
 * scroll the old way.
 */
const EARLY_PX = 400;

function containerOf(sentinel: HTMLElement | null): HTMLElement | null {
  return sentinel === null ? null : scrollParentOf(sentinel);
}

export function useLoadOlder(input: {
  oldestId: string | undefined;
  canLoad: boolean;
  load: () => void;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const anchor = useRef<{ id: string | undefined; height: number } | null>(null);
  const { oldestId, canLoad, load } = input;

  const request = useCallback(() => {
    if (!canLoad) return;
    // Remembered BEFORE the request so the restore below has something to compare against.
    anchor.current = { id: oldestId, height: scrollHeightOf(containerOf(sentinelRef.current)) };
    load();
  }, [canLoad, load, oldestId]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (sentinel === null || typeof IntersectionObserver !== 'function') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) request();
      },
      { root: containerOf(sentinel), rootMargin: `${EARLY_PX}px 0px 0px 0px` },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [request]);

  useLayoutEffect(() => {
    const held = anchor.current;
    // Only once the prepend has actually landed, which is when the oldest id changes.
    if (held === null || held.id === oldestId) return;
    anchor.current = null;
    const container = containerOf(sentinelRef.current);
    const grew = scrollHeightOf(container) - held.height;
    if (grew > 0) scrollDownBy(container, grew);
  }, [oldestId]);

  return sentinelRef;
}
