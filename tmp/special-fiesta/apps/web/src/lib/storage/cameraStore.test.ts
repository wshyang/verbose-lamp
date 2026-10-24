import { beforeEach, describe, expect, it } from 'vitest';
import { forgetCameraDevice, readCameraDevice, writeCameraDevice } from './cameraStore.js';

/** ADR-184 — the remembered lens, one key per viewfinder. */

beforeEach(() => {
  window.localStorage.clear();
});

describe('cameraStore', () => {
  it('remembers nothing until a camera has actually opened', () => {
    expect(readCameraDevice('scanner')).toBeNull();
    expect(readCameraDevice('selfie')).toBeNull();
  });

  it('keeps the two surfaces apart', () => {
    /*
     * The scanner wants the back lens and the selfie camera wants the front, so a single
     * shared "preferred camera" would be wrong for one of them by construction.
     */
    writeCameraDevice('scanner', 'back-lens');
    writeCameraDevice('selfie', 'front-lens');
    expect(readCameraDevice('scanner')).toBe('back-lens');
    expect(readCameraDevice('selfie')).toBe('front-lens');

    forgetCameraDevice('scanner');
    expect(readCameraDevice('scanner')).toBeNull();
    expect(readCameraDevice('selfie')).toBe('front-lens');
  });

  it('treats an empty string as no preference', () => {
    // A browser that hands back '' for deviceId must not be recorded as a camera to demand.
    writeCameraDevice('scanner', '');
    expect(readCameraDevice('scanner')).toBeNull();
  });
});
