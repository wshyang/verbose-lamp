/**
 * Which renderer mounts. The imperative manager and the React Three Fiber port coexist
 * until the parity check (ADDENDUM-022 Phase 4); `?renderer=r3f` opts in. The default stays
 * the manager, so nothing changes for anyone who does not ask.
 */
export type RendererMode = 'manager' | 'r3f';

export const RENDERER_PARAM = 'renderer';
export const DEFAULT_RENDERER: RendererMode = 'manager';

/** The renderer a URL asks for. Anything unrecognised, including a wrong-case value, is the default. */
export function parseRenderer(search: string): RendererMode {
  const raw = new URLSearchParams(search).get(RENDERER_PARAM)?.trim();
  return raw === 'r3f' || raw === 'manager' ? raw : DEFAULT_RENDERER;
}
