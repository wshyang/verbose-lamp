/**
 * The one module that touches `window.localStorage` (ADR-009, ADR-019). Everything else —
 * the offline scan queue, the session token, the last visited surface — goes through these
 * three functions, so there is a single place that knows how storage misbehaves.
 *
 * Storage is not dependable on the devices this runs on: a sandboxed frame throws on access,
 * Safari in private mode throws on write, a full phone throws on quota. None of that may take
 * the app down, so every access falls back to memory and keeps working for the life of the
 * page. Removal is remembered even when the browser refuses it, so signing out cannot be
 * undone by a store that would not let go.
 */

const fallback = new Map<string, string>();
const undeletable = new Set<string>();

function attempt<T>(access: () => T, onRefusal: T): T {
  try {
    return access();
  } catch {
    return onRefusal;
  }
}

function backend(): Storage | null {
  return attempt(() => window.localStorage, null);
}

/**
 * Memory holds a key only while the store is refusing it, so a store that works stays the
 * single source of truth — clearing it really clears, in a browser and in a test alike.
 */
export function readItem(key: string): string | null {
  if (undeletable.has(key)) return null;
  const store = backend();
  const stored = store === null ? null : attempt(() => store.getItem(key), null);
  return stored ?? fallback.get(key) ?? null;
}

export function writeItem(key: string, value: string): void {
  undeletable.delete(key);
  const store = backend();
  const written =
    store !== null &&
    attempt(() => {
      store.setItem(key, value);
      return true;
    }, false);
  if (written) fallback.delete(key);
  else fallback.set(key, value);
}

export function removeItem(key: string): void {
  fallback.delete(key);
  const store = backend();
  if (store === null) return;
  const dropped = attempt(() => {
    store.removeItem(key);
    return true;
  }, false);
  // The store kept it anyway: remember that it is gone, or signing out would not stick.
  if (!dropped) undeletable.add(key);
}
