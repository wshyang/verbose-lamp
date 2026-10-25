/**
 * Which premiere renderer the page should mount (ADDENDUM-022 §6 step 2.5).
 *
 * The React Three Fiber port ships behind a query flag rather than as the default:
 * the likeness baselines are the visual contract, and Phase 2 may only become the
 * default once every Phase 0 shot passes **unchanged**. Until then
 * `?renderer=r3f` is how the port can be compared side by side, in a browser and
 * from the e2e harness, while `GatsbySceneManager` stays what the app renders.
 */
export type PremiereRenderer = 'manager' | 'r3f';

export const RENDERER_PARAM = 'renderer';
export const R3F_RENDERER_VALUE = 'r3f';

/** `?renderer=r3f` selects the port; anything else (or nothing) keeps the manager. */
export function parseRendererMode(search: string): PremiereRenderer {
  const normalized = search.startsWith('?') ? search.slice(1) : search;
  const raw = new URLSearchParams(normalized).get(RENDERER_PARAM);
  return raw?.trim().toLowerCase() === R3F_RENDERER_VALUE ? 'r3f' : 'manager';
}
