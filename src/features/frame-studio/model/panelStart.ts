/**
 * Whether the Frame Studio should be showing when the page loads (ADDENDUM-044).
 *
 * The panel is a 320 px column pinned to the right edge. On a desktop that is a
 * dock beside the stage; on a phone it is most of the screen — and it is on top,
 * so it covered the header, the timeline and the effects launchers. The Playwright
 * mobile project found it the first time the suites ran: every launch button was
 * present, visible and unclickable.
 *
 * A panel that starts closed is one tap away (`frame-studio__reveal`, or `F`); a
 * panel that starts open on a phone hides the film the user came to watch.
 */

/** Below this width the panel starts collapsed. Matches the layout's own breakpoint. */
export const COMPACT_VIEWPORT_WIDTH = 1024;

export function panelStartsOpen(viewportWidth: number): boolean {
  return viewportWidth >= COMPACT_VIEWPORT_WIDTH;
}
