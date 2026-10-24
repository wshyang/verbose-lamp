/**
 * A controllable stand-in for `Image`, in the same spirit as `fetchStub` and
 * `eventSourceStub`: the *browser* boundary is replaced, never one of our own modules.
 *
 * jsdom constructs an `Image` happily and then does nothing — no request, no `load`, no
 * `error`, ever. A preload test against that would hang rather than fail, and worse, a test
 * that only asserted the end state would pass against code that never waited for anything.
 * So loading is explicit here: nothing resolves until the test says it has.
 */

interface PendingImage {
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
}

export interface ImageStubOptions {
  /**
   * Give the stub a `decode()`, as every current browser has. Omitted, it behaves like jsdom
   * and older Safari, where the load event is all there is — both paths ship, so both are
   * worth being able to test.
   */
  decode?: 'resolves' | 'rejects';
}

export interface ImageStub {
  /** Every URL a preload asked for, in order. */
  requested: string[];
  /** How many are still waiting — the state in which a scene must not be shown. */
  pending: () => number;
  /** Finish every outstanding request successfully. */
  settleAll: () => void;
  /** Fail every outstanding request, as a 401 or a hidden photo would. */
  failAll: () => void;
  restore: () => void;
}

export function installImageStub(options?: ImageStubOptions): ImageStub {
  const original = Reflect.get(globalThis, 'Image') as unknown;
  const open: PendingImage[] = [];
  const requested: string[] = [];

  const decodeMode = options?.decode;

  class StubImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    #src = '';

    get src(): string {
      return this.#src;
    }

    readonly decode =
      decodeMode === undefined
        ? undefined
        : (): Promise<void> =>
            decodeMode === 'resolves' ? Promise.resolve() : Promise.reject(new Error('superseded'));

    /** Setting `src` is what starts a request in a browser, so it is what enqueues here. */
    set src(value: string) {
      this.#src = value;
      requested.push(value);
      open.push(this as unknown as PendingImage);
    }
  }

  Reflect.set(globalThis, 'Image', StubImage);

  const drain = (finish: (image: PendingImage) => void): void => {
    const waiting = open.splice(0, open.length);
    for (const image of waiting) finish(image);
  };

  return {
    requested,
    pending: () => open.length,
    settleAll: () => drain((image) => image.onload?.()),
    failAll: () => drain((image) => image.onerror?.()),
    restore: () => Reflect.set(globalThis, 'Image', original),
  };
}
