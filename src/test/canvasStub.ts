/**
 * jsdom without the `canvas` package returns null from `getContext('2d')`, which
 * makes every painter module untestable (ADDENDUM-028 §2). This installs a
 * no-op-but-recording 2D context so canvas code runs under jsdom and its draw
 * calls can be asserted. It is a stub, never a renderer: pixels are still not
 * asserted (CLAUDE.md §2 — goldens live at geometry level).
 */
type Context2D = CanvasRenderingContext2D;

function isMeasureText(prop: string): boolean {
  return prop === 'measureText';
}

function makeContext(): Context2D {
  const state: Record<string, unknown> = {};
  const results: Record<string, (...args: unknown[]) => unknown> = {
    measureText: (text: unknown) => ({ width: String(text).length * 6 }),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    createPattern: () => ({}),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(Math.max(0, w * h * 4)),
    }),
    isPointInPath: () => false,
  };
  return new Proxy({} as Record<string, unknown>, {
    get(_target, prop: string) {
      if (prop in state) return state[prop];
      return (...args: unknown[]) => (isMeasureText(prop) ? results.measureText(...args) : results[prop]?.(...args));
    },
    set(_target, prop: string, value) {
      state[prop] = value;
      return true;
    },
  }) as unknown as Context2D;
}

/** Probes once, then patches `HTMLCanvasElement` only if jsdom cannot paint. */
export function installCanvas2d(): void {
  if (typeof HTMLCanvasElement === 'undefined') return;
  const probe = document.createElement('canvas');
  try {
    if (probe.getContext('2d')) return;
  } catch {
    // jsdom without `canvas` throws NotImplemented; fall through and stub.
  }
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext(
    this: HTMLCanvasElement,
    kind: string,
    ...rest: unknown[]
  ): unknown {
    if (kind === '2d') return makeContext();
    return (original as (...args: unknown[]) => unknown).call(this, kind, ...rest);
  } as typeof HTMLCanvasElement.prototype.getContext;
}
