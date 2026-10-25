/**
 * Font readiness (ADDENDUM-030).
 *
 * The sequence rasterises type on a canvas — `Cinzel` in the lucky drum,
 * `Cinzel Decorative` in the countdown and the name reveal. Canvas drawing does not
 * wait for a webfont: paint before it arrives and you get Georgia, permanently,
 * because the pixels are already baked into a texture. Mounting the app only after
 * the faces are ready removes that race, and makes the screenshot gate repeatable.
 */
export interface FontSet {
  readonly ready: Promise<unknown>;
}

/**
 * Resolves once every declared face has loaded, or immediately where the Font
 * Loading API is absent (older browsers, jsdom, workers).
 */
export function waitForFonts(fonts?: FontSet): Promise<void> {
  const set = fonts ?? (typeof document === 'undefined' ? undefined : (document.fonts as FontSet | undefined));
  if (!set || typeof set.ready?.then !== 'function') return Promise.resolve();
  // A face that fails to decode must not block the app forever.
  return Promise.resolve(set.ready).then(
    () => undefined,
    () => undefined
  );
}
