/**
 * ADR-098 — the participant shell stopped scrolling the document: `.gb-main` is its own
 * scroll container. Hooks that reason about "the scroll position" (pull-to-refresh,
 * load-older anchoring) resolve the container that actually scrolls their element, and
 * fall back to the document for surfaces that still scroll the old way.
 */

/** The nearest ancestor that scrolls vertically, or null when the document does. */
export function scrollParentOf(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node !== null) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

export function scrollTopOf(container: HTMLElement | null): number {
  return container === null ? window.scrollY : container.scrollTop;
}

export function scrollHeightOf(container: HTMLElement | null): number {
  return container === null ? document.documentElement.scrollHeight : container.scrollHeight;
}

/** Move the reader down by `px` without animation, wherever the scrolling happens. */
export function scrollDownBy(container: HTMLElement | null, px: number): void {
  if (container === null) window.scrollBy(0, px);
  else container.scrollTop += px;
}
