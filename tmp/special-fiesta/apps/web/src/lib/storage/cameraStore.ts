import { readItem, removeItem, writeItem } from './localStore.js';

/**
 * ADR-184 — which physical camera each viewfinder should open with.
 *
 * **Why this is remembered at all.** `facingMode: 'environment'` is a *hint*, not an
 * instruction: the spec treats a bare constraint value as `ideal`, so a browser is free to hand
 * back the front camera and is never required to say it did. On hardware whose driver does not
 * report `facingMode` as a capability — most commonly a Windows 2-in-1, but any webcam can do it
 * — Chromium cannot resolve the hint at all and returns the same lens whatever is asked for. A
 * marshal who has to fix that by hand on every single scan will stop using the scanner.
 *
 * **Per surface, not per device.** The QR scanner wants the back lens and the selfie camera
 * wants the front, so one shared "preferred camera" would be wrong for one of them by
 * construction. Two keys, two meanings — which is also what `check-standards.mjs`'s
 * `storage-ownership` rule asks for.
 *
 * **A deviceId, not a facing direction.** Storing `'user'` / `'environment'` would record the
 * hint that was already not believed. A `deviceId` names the lens the browser actually opened,
 * read back from the live track, so it is the one identifier that survives the ambiguity.
 */

const KEYS = {
  scanner: 'psd.camera.scanner.v1',
  selfie: 'psd.camera.selfie.v1',
} as const;

export type CameraSurface = keyof typeof KEYS;

/**
 * The camera this surface last opened successfully, or null for "use the facing hint".
 *
 * A stored id can be stale in ways that are entirely normal: a facilitator borrows a different
 * phone, a USB webcam is unplugged, a browser rotates its deviceIds after a permission reset.
 * Callers must treat the answer as a preference that may fail, and `useCameraSession` does —
 * it falls back to the facing hint and clears the key rather than leaving a viewfinder dark.
 */
export function readCameraDevice(surface: CameraSurface): string | null {
  const raw = readItem(KEYS[surface]);
  return raw === null || raw === '' ? null : raw;
}

export function writeCameraDevice(surface: CameraSurface, deviceId: string): void {
  writeItem(KEYS[surface], deviceId);
}

/** Used when a remembered camera turns out not to exist, so the next open starts clean. */
export function forgetCameraDevice(surface: CameraSurface): void {
  removeItem(KEYS[surface]);
}
