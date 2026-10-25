/**
 * Which renderer draws the sequence (ADDENDUM-022 §2.4, ADDENDUM-026 §5).
 *
 * The React Three Fiber scene is the default. `?renderer=classic` keeps the
 * imperative `GatsbySceneManager` reachable until the screenshot gate has been
 * captured by the user on a real browser; deleting the old renderer is the last
 * step of the port and needs that gate to exist.
 */
export type RendererMode = 'r3f' | 'classic';

export const RENDERER_PARAM = 'renderer';

export function parseRenderer(search: string): RendererMode {
  return new URLSearchParams(search).get(RENDERER_PARAM) === 'classic' ? 'classic' : 'r3f';
}
