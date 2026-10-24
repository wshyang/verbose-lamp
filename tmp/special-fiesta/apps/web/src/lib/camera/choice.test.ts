import { describe, expect, it } from 'vitest';
import {
  describeCamera,
  deviceIdOf,
  nextCamera,
  videoConstraints,
  videoInputsOf,
  type CameraOption,
} from './choice.js';

/** ADR-184 — choosing a lens when `facingMode` is only a suggestion. */

const CAMERAS: CameraOption[] = [
  { deviceId: 'back', label: 'Back Camera' },
  { deviceId: 'front', label: 'Front Camera' },
  { deviceId: 'wide', label: '' },
];

describe('videoConstraints', () => {
  it('asks for a facing direction when no camera is remembered', () => {
    expect(videoConstraints(null, 'environment')).toEqual({ facingMode: 'environment' });
  });

  it('demands a remembered camera EXACTLY, so a missing one fails loudly', () => {
    /*
     * The whole point. A bare `deviceId` would be another *ideal* hint and the browser could
     * ignore it exactly as it ignores `facingMode` — leaving the switch control silently doing
     * nothing. `exact` turns a vanished camera into a rejection the caller can recover from.
     */
    expect(videoConstraints('front', 'environment')).toEqual({ deviceId: { exact: 'front' } });
  });
});

describe('videoInputsOf', () => {
  it('keeps the cameras and drops the microphones', () => {
    const devices = [
      { kind: 'videoinput', deviceId: 'a', label: 'Back' },
      { kind: 'audioinput', deviceId: 'b', label: 'Mic' },
      { kind: 'audiooutput', deviceId: 'c', label: 'Speaker' },
      { kind: 'videoinput', deviceId: 'd', label: '' },
    ] as unknown as MediaDeviceInfo[];
    expect(videoInputsOf(devices)).toEqual([
      { deviceId: 'a', label: 'Back' },
      { deviceId: 'd', label: '' },
    ]);
  });
});

describe('nextCamera', () => {
  it('has nothing to offer when there is one camera or none', () => {
    expect(nextCamera([], null)).toBeNull();
    expect(nextCamera([CAMERAS[0] as CameraOption], 'back')).toBeNull();
  });

  it('cycles, and wraps round the end', () => {
    expect(nextCamera(CAMERAS, 'back')).toBe('front');
    expect(nextCamera(CAMERAS, 'front')).toBe('wide');
    expect(nextCamera(CAMERAS, 'wide')).toBe('back');
  });

  it('starts at the beginning when the live camera is unknown', () => {
    /*
     * Some browsers report no deviceId on the track until permission is fully settled. Pressing
     * "switch" is itself the statement that the current lens is wrong, so any other is progress
     * — refusing to move would strand the person the control exists for.
     */
    expect(nextCamera(CAMERAS, null)).toBe('back');
    expect(nextCamera(CAMERAS, 'unplugged-since')).toBe('back');
  });
});

describe('describeCamera', () => {
  it('says nothing useful when there is nothing to choose between', () => {
    expect(describeCamera([CAMERAS[0] as CameraOption], 'back')).toBe('Camera');
  });

  it('leads with the position, because a browser label is often absent', () => {
    expect(describeCamera(CAMERAS, 'front')).toBe('Camera 2 of 3 — Front Camera');
    expect(describeCamera(CAMERAS, 'wide')).toBe('Camera 3 of 3');
    expect(describeCamera(CAMERAS, null)).toBe('Camera ? of 3');
  });
});

describe('deviceIdOf', () => {
  function streamOf(settings: unknown): MediaStream {
    return { getVideoTracks: () => [{ getSettings: () => settings }] } as unknown as MediaStream;
  }

  it('reports what the track actually opened', () => {
    expect(deviceIdOf(streamOf({ deviceId: 'back' }))).toBe('back');
  });

  it('is null when the browser will not say, rather than guessing', () => {
    // Recording a guess would persist it, and the next open would demand a camera that was
    // never confirmed to exist.
    expect(deviceIdOf(streamOf({}))).toBeNull();
    expect(deviceIdOf(streamOf({ deviceId: '' }))).toBeNull();
    expect(deviceIdOf({ getVideoTracks: () => [] } as unknown as MediaStream)).toBeNull();
  });
});
