/**
 * ADR-143 — an image is not ready when it is requested, it is ready when it has decoded.
 *
 * On the hall screen this is the difference between a feature and an embarrassment. Every
 * scene of the filmstrip is mounted at once (ADR-141), side by side on one track, so an
 * `<img>` that has not finished arriving is *already on the wall* — it does not wait politely
 * for the slide to reveal it. The room would watch the strip scroll onto a grey box with a
 * broken-image glyph in the middle of it, three metres wide.
 *
 * So nothing is shown until it is decoded. `decode()` rather than `load`: a loaded image can
 * still cost the compositor its first frame when it is finally painted, and on a projector
 * driven by whatever laptop was in the AV cupboard that lands exactly as the slide starts
 * moving. Where `decode()` is missing — jsdom, older Safari — the load event is the answer
 * we have, and it is still strictly better than hope.
 *
 * The cache is module-level and never evicted during an event: a few hundred thumbnails at a
 * few kilobytes each is nothing beside the cost of showing one of them half-arrived, and the
 * browser's own cache means a second `preload` of a known URL is free either way.
 */

const decoded = new Set<string>();
const broken = new Set<string>();
const inFlight = new Map<string, Promise<void>>();

/**
 * How long one image gets before the scene gives up on it and moves on.
 *
 * A browser does not promise to fire `onload` OR `onerror`: a request can hang — a stalled
 * tunnel, a backgrounded tab, a projector laptop that lost Wi-Fi mid-fetch — and then neither
 * handler ever runs. Without a ceiling that hangs the whole scene, because the batch is
 * awaited with `Promise.all`: one dead thumbnail and the hall screen stops changing photos
 * for the rest of the event, with nothing in the console to say why.
 *
 * Ten seconds is far longer than a thumbnail on a working connection and far shorter than a
 * scene cycle, so the cost of being wrong is one missing photo for one rotation.
 */
export const IMAGE_LOAD_TIMEOUT_MS = 10_000;

/** True once the bytes are in and decoded, so painting this URL cannot stall or flash. */
export function isImageDecoded(url: string): boolean {
  return decoded.has(url);
}

/** True when this URL answered with an error — a hidden photo, a 401, a dead tunnel. */
export function isImageBroken(url: string): boolean {
  return broken.has(url);
}

function load(url: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const image = new Image();
    let isSettled = false;
    /** Resolve exactly once, whichever of load, error or the ceiling gets there first. */
    const finish = (): void => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(timer);
      resolve();
    };
    /*
     * Deliberately NOT added to `broken`: a timeout is "we did not find out", not "this image
     * is bad". Leaving it unknown lets the next scene try again, which is what a recovered
     * connection deserves; `broken` is forever and is reserved for an actual error response.
     */
    const timer = setTimeout(finish, IMAGE_LOAD_TIMEOUT_MS);
    const succeed = (): void => {
      decoded.add(url);
      finish();
    };
    image.onload = () => {
      /*
       * `decode()` resolves when the bitmap is ready to paint. Its rejection is not a broken
       * image — it fires when a decode is superseded or the element is detached — so a
       * rejection after a clean load still counts as loaded, which is what `onload` said.
       */
      const decoding = image.decode?.();
      if (decoding === undefined) succeed();
      else void decoding.then(succeed, succeed);
    };
    image.onerror = () => {
      broken.add(url);
      finish();
    };
    image.src = url;
  });
}

/**
 * Fetch and decode, once per URL. Resolves true when the image is safe to show.
 *
 * Concurrent callers share one request: the two photo scenes can ask for overlapping photos,
 * and a projector that pulled every popular photo twice would be doing the one thing the
 * gallery's caching was designed to avoid.
 */
export async function preloadImage(url: string): Promise<boolean> {
  if (!decoded.has(url) && !broken.has(url)) {
    const attempt = inFlight.get(url) ?? load(url);
    inFlight.set(url, attempt);
    await attempt;
    /*
     * Unconditional, and safe to be: `load` resolves and never rejects, and the ceiling above
     * guarantees it resolves at all. A `try/finally` here was tried and removed — no test
     * could make it matter, and an arm nothing can reach is one nobody maintains.
     */
    inFlight.delete(url);
  }
  return decoded.has(url);
}

/** Test seam, and the sign-out path: one session's images are not another's. */
export function resetImagePreload(): void {
  decoded.clear();
  broken.clear();
  inFlight.clear();
}
