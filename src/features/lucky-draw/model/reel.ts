/**
 * Virtual reel (ADDENDUM-020 §3.7): 16 physical plates, unbounded logical
 * position P in slot units. Plates only take new labels on the hidden back
 * half, so the visible window always reads as contiguous entries.
 */
export const PLATE_COUNT = 16;

/** Wrap a plate offset into [−8, 8): its signed distance from the front. */
export function wrapHalf(offset: number): number {
  return ((((offset + PLATE_COUNT / 2) % PLATE_COUNT) + PLATE_COUNT) % PLATE_COUNT) - PLATE_COUNT / 2;
}

/** Logical slot a physical plate currently carries at position P. */
export function plateSlot(plateIndex: number, position: number): number {
  return Math.round(position + wrapHalf(plateIndex - position));
}

export function plateEntryIndex(plateIndex: number, position: number, n: number): number {
  return ((plateSlot(plateIndex, position) % n) + n) % n;
}

/** Entry indices shown in the visible window, row 0 at the front. */
export function visibleRows(position: number, n: number, span = 3): readonly number[] {
  const base = Math.round(position);
  return Array.from({ length: span * 2 + 1 }, (_, i) => (((base + i - span) % n) + n) % n);
}

/** A plate is hidden when it sits beyond ±4 slots from the front (back half). */
export function isPlateHidden(plateIndex: number, position: number): boolean {
  return Math.abs(wrapHalf(plateIndex - position)) > 4;
}