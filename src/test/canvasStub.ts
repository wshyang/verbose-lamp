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

/** A transparent image of the requested size, tolerating jsdom's loose argument types. */
function imageDataOf(w: unknown, h: unknown): ImageData {
  const width = Number(w);
  const height = Number(h);
  return { width, height, data: new Uint8ClampedArray(Math.max(0, width * height * 4)) } as ImageData;
}

function makeContext(): Context2D {
  const state: Record<string, unknown> = {};
  const results: Record<string, (...args: unknown[]) => unknown> = {
    measureText: (text: unknown) => ({ width: String(text).length * 6 }),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    createPattern: () => ({}),
    createImageData: (w: unknown, h: unknown) => imageDataOf(w, h),
    getImageData: (_x: unknown, _y: unknown, w: unknown, h: unknown) => imageDataOf(w, h),
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
/**
 * jsdom has no `Path2D`, and the deco alphabet builds every glyph by tracing one
 * (`moveTo` / `lineTo` / `arc` / `closePath`). The stub records those calls so a
 * test can assert a path was traced; it does not rasterise anything.
 */
export interface RecordedPath {
  readonly ops: string[];
}

export function installPath2d(): void {
  if (typeof globalThis.Path2D === 'function') return;
  class RecordingPath2D {
    readonly ops: string[] = [];
    moveTo(x: number, y: number): void {
      this.ops.push(`M${x},${y}`);
    }
    lineTo(x: number, y: number): void {
      this.ops.push(`L${x},${y}`);
    }
    quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
      this.ops.push(`Q${cx},${cy},${x},${y}`);
    }
    bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
      this.ops.push(`C${c1x},${c1y},${c2x},${c2y},${x},${y}`);
    }
    arc(x: number, y: number, r: number, from: number, to: number, ccw = false): void {
      this.ops.push(`A${x},${y},${r},${from},${to},${ccw ? 1 : 0}`);
    }
    closePath(): void {
      this.ops.push('Z');
    }
  }
  globalThis.Path2D = RecordingPath2D as unknown as typeof Path2D;
}

export function installCanvas2d(): void {
  installPath2d();
  if (typeof HTMLCanvasElement === 'undefined') return;
  const probe = document.createElement('canvas');
  try {
    if (probe.getContext('2d')) return;
  } catch {
    // jsdom without `canvas` throws NotImplemented; fall through and stub.
  }
  // jsdom's toBlob never invokes its callback; exports need a real Blob promise.
  HTMLCanvasElement.prototype.toBlob = function toBlob(callback: BlobCallback): void {
    queueMicrotask(() => callback(new Blob()));
  } as typeof HTMLCanvasElement.prototype.toBlob;
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
