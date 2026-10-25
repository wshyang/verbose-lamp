import { vi } from 'vitest';

/**
 * A recording 2D canvas context for jsdom (which ships no canvas backend).
 *
 * It records draw calls as text and returns real typed arrays for pixel APIs, so
 * texture builders run their actual arithmetic instead of being mocked out
 * (ADDENDUM-029 §4). Gradients, paths and text are inert: only the numbers the
 * code computes are observable, which is exactly what a geometry-level test
 * wants.
 */
export interface Canvas2d {
  /** Every draw call, in order, as `name(args)`. */
  calls: string[];
  /** One entry per `getContext('2d')` call, in creation order. */
  contexts: CanvasRenderingContext2D[];
  /** Every `putImageData` payload, in call order. */
  images: ImageData[];
}

let current: Canvas2d | null = null;

/** Options for the recorder. */
export interface Canvas2dOptions {
  /**
   * Fill the alpha channel of every `getImageData` read with 255. Texture
   * builders that derive a mask from their own drawing see "ink everywhere"
   * instead of the empty default, which is the only way to exercise their
   * chamfer and plateau branches without a real rasteriser.
   */
  readonly opaqueReadback?: boolean;
}

function createGradient(calls: string[], id: number) {
  return {
    __gradient: id,
    addColorStop: (offset: number, color: string) =>
      calls.push(`gradient#${id}.addColorStop(${offset},${color})`),
  };
}

const RECORDED_METHODS = [
  'fillRect', 'clearRect', 'strokeRect', 'beginPath', 'closePath', 'moveTo', 'lineTo',
  'arc', 'arcTo', 'ellipse', 'rect', 'fill', 'stroke', 'save', 'restore', 'translate',
  'rotate', 'scale', 'setTransform', 'resetTransform', 'clip', 'drawImage', 'fillText',
  'strokeText', 'setLineDash', 'quadraticCurveTo', 'bezierCurveTo', 'createPattern',
] as const;

const roundForLog = (arg: unknown): string =>
  typeof arg === 'number' ? String(Math.round(arg * 1000) / 1000) : String(arg);

/** A method that does nothing but note it was called, with its arguments rounded for a stable log. */
const recorded =
  (calls: string[], name: string) =>
  (...args: unknown[]) =>
    calls.push(`${name}(${args.map(roundForLog).join(',')})`);

/** Both gradient kinds share one counter, so a recording numbers them in creation order. */
function gradientFactories(calls: string[]) {
  let count = 0;
  const make = (kind: 'createLinearGradient' | 'createRadialGradient') => (...args: unknown[]) => {
    calls.push(`${kind}(${args.join(',')})`);
    count += 1;
    return createGradient(calls, count);
  };
  return { createLinearGradient: make('createLinearGradient'), createRadialGradient: make('createRadialGradient') };
}

interface Surface {
  calls: string[];
  images: ImageData[];
  options: Canvas2dOptions;
}

/** The pixel APIs: real typed arrays, so texture builders run their actual arithmetic. */
function pixelApi({ calls, images, options }: Surface): Record<string, unknown> {
  return {
    // The origin is ignored: only the size of the read-back matters to the code under test.
    getImageData: (...[, , w, h]: [number, number, number, number]) => {
      calls.push(`getImageData(${w}x${h})`);
      const data = new Uint8ClampedArray(w * h * 4);
      if (options.opaqueReadback === true) {
        for (let index = 3; index < data.length; index += 4) data[index] = 255;
      }
      return { data, width: w, height: h } as ImageData;
    },
    createImageData: (w: number, h: number) => {
      calls.push(`createImageData(${w}x${h})`);
      return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h } as ImageData;
    },
    putImageData: (image: ImageData) => {
      images.push(image);
      calls.push(`putImageData(${image.width}x${image.height})`);
    },
  };
}

function createContext(
  calls: string[],
  images: ImageData[],
  options: Canvas2dOptions
): CanvasRenderingContext2D {
  const state: Record<string, unknown> = {};
  const api: Record<string, unknown> = {
    ...gradientFactories(calls),
    ...pixelApi({ calls, images, options }),
    measureText: (text: string) => ({ width: String(text).length * 10 }),
    getContextAttributes: () => ({}),
  };
  // Applied last, so a recorded method wins over a same-named stub above (createPattern is both:
  // the draw call is logged and returns nothing, as the unrefactored helper always did).
  for (const name of RECORDED_METHODS) api[name] = recorded(calls, name);

  return new Proxy(state, {
    get(target, prop: string) {
      return prop in api ? api[prop] : target[prop];
    },
    set(target, prop: string, value) {
      target[prop] = value;
      calls.push(`${prop}=${String(value)}`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

/**
 * Installs the stub on `HTMLCanvasElement.prototype.getContext` and returns the
 * recorder. Call from `beforeEach`; `getContext` is restored by
 * `vi.restoreAllMocks()`.
 */
export function installCanvas2d(options: Canvas2dOptions = {}): Canvas2d {
  const recorder: Canvas2d = { calls: [], contexts: [], images: [] };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((kind: string) => {
    if (kind !== '2d') return null;
    const ctx = createContext(recorder.calls, recorder.images, options);
    recorder.contexts.push(ctx);
    return ctx;
  }) as HTMLCanvasElement['getContext']);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,');
  current = recorder;
  return recorder;
}

export function canvasCalls(): string[] {
  return current?.calls ?? [];
}
