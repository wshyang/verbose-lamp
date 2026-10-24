import { required } from '../required.js';

/**
 * ADR-184 — choosing a lens, and cycling to the next one.
 *
 * All of the decisions live here, away from `useCameraSession`, for the usual reason: a
 * `MediaStream` cannot be created in jsdom at all, so anything that could be wrong has to be
 * reachable without one.
 */

/** A camera this browser will admit to having. `label` is empty until permission is granted. */
export interface CameraOption {
  deviceId: string;
  label: string;
}

/**
 * What to ask `getUserMedia` for.
 *
 * `deviceId` uses `exact`, which is the whole point: a bare `deviceId` would be another *ideal*
 * hint, and the browser could ignore it exactly as it ignores `facingMode`. If the remembered
 * camera is gone this must FAIL — loudly and catchably — rather than silently opening some
 * other lens, because the caller's fallback is to forget the preference and start over.
 *
 * With no remembered device, the facing hint is used unchanged. It stays a hint on purpose:
 * `{ exact: 'environment' }` would reject outright on every laptop and most desktops, turning
 * a working-but-wrong camera into no camera at all.
 */
export function videoConstraints(
  deviceId: string | null,
  facingMode: 'user' | 'environment',
): MediaTrackConstraints {
  return deviceId === null ? { facingMode } : { deviceId: { exact: deviceId } };
}

/** The video inputs, in the browser's own order. Anything that is not a camera is dropped. */
export function videoInputsOf(devices: readonly MediaDeviceInfo[]): CameraOption[] {
  return devices
    .filter((device) => device.kind === 'videoinput')
    .map((device) => ({ deviceId: device.deviceId, label: device.label }));
}

/**
 * The next camera to try, cycling and wrapping.
 *
 * `current` is the device the live track reports, not the one that was requested — those differ
 * precisely when `facingMode` was ignored, which is the case this feature exists for. When it is
 * unknown or no longer listed, the cycle starts at the beginning rather than giving up: a
 * participant pressing "switch" has told us the current lens is wrong, so any other is progress.
 *
 * Returns null only when there is genuinely nothing to switch to, which is what hides the
 * control.
 */
export function nextCamera(cameras: readonly CameraOption[], current: string | null): string | null {
  if (cameras.length < 2) return null;
  const index = cameras.findIndex((camera) => camera.deviceId === current);
  // `length >= 2` above, and a modulo of it, so both of these are guaranteed present — the
  // throwing accessor says so rather than inventing a null the callers would have to handle.
  if (index === -1) return required(cameras[0], 'first camera').deviceId;
  return required(cameras[(index + 1) % cameras.length], 'next camera').deviceId;
}

/**
 * What to call the lens currently in use, for the button beneath the viewfinder.
 *
 * Labels are the browser's and are often blank before permission, or unhelpfully long after it
 * ("Back Ultra Wide Camera (05ac:8514)"). A position is more use than a truncated model number
 * to someone deciding whether to press the button, so the count leads and the label follows only
 * when there is one.
 */
export function describeCamera(cameras: readonly CameraOption[], current: string | null): string {
  if (cameras.length < 2) return 'Camera';
  const index = cameras.findIndex((camera) => camera.deviceId === current);
  const position = index === -1 ? '?' : `${index + 1}`;
  const label = index === -1 ? '' : required(cameras[index], 'current camera').label;
  const counted = `Camera ${position} of ${cameras.length}`;
  return label === '' ? counted : `${counted} — ${label}`;
}

/**
 * The deviceId a live stream actually opened, which is the only trustworthy answer.
 *
 * Every step is optional because every step genuinely is. `getVideoTracks` and `getSettings`
 * are missing from older WebRTC implementations and from an audio-only stream; `deviceId` is
 * absent from the settings of several browsers until permission is fully settled. None of that
 * is an error — it means "this browser will not say", and the honest answer is null, because
 * recording a guess would persist it and the next open would demand a camera never confirmed
 * to exist.
 */
export function deviceIdOf(stream: MediaStream): string | null {
  if (typeof stream.getVideoTracks !== 'function') return null;
  const track = stream.getVideoTracks()[0];
  if (track === undefined || typeof track.getSettings !== 'function') return null;
  const deviceId = track.getSettings().deviceId;
  return typeof deviceId === 'string' && deviceId !== '' ? deviceId : null;
}
