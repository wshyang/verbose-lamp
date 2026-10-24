import { useCallback, useRef } from 'react';
import jsQR from 'jsqr';
import { useCameraSession } from './useCameraSession.js';

/**
 * F26 — camera QR capture for the fringe station. Decoding runs on a hidden canvas via jsQR,
 * so there is no native BarcodeDetector requirement and no extra permission beyond the camera.
 *
 * Manual nickname entry (F28) is always available: a beach in glare with a denied camera
 * permission must never block scoring, so `isSupported: false` is a normal state, not an error.
 */

const FRAME_INTERVAL_MS = 220;
const REPEAT_BLOCK_MS = 1500;

export interface QrScannerState {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isActive: boolean;
  isSupported: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
  /** ADR-184 — position of the lens in use, e.g. "Camera 2 of 3 — Front Camera". */
  cameraLabel: string;
  /** Null when this device has nothing to switch to, which hides the control. */
  switchCamera: (() => void) | null;
}

/** Pulls one frame off the video element and returns the QR payload, if any. */
function decodeFrame(video: HTMLVideoElement | null, canvas: HTMLCanvasElement | null): string | null {
  if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) return null;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const frame = context.getImageData(0, 0, canvas.width, canvas.height);
  const found = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' });
  return found?.data ?? null;
}

export function useQrScanner(onDecoded: (value: string) => void): QrScannerState {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastValueRef = useRef<string | null>(null);
  const onDecodedRef = useRef(onDecoded);
  onDecodedRef.current = onDecoded;

  const readFrame = useCallback(() => {
    const value = decodeFrame(videoRef.current, canvasRef.current);
    if (!value || value === lastValueRef.current) return;
    lastValueRef.current = value;
    onDecodedRef.current(value);
    // Let the same badge be scanned again after a beat, e.g. to retry a rejected scan.
    setTimeout(() => {
      lastValueRef.current = null;
    }, REPEAT_BLOCK_MS);
  }, []);

  const camera = useCameraSession({
    videoRef,
    onFrame: readFrame,
    frameIntervalMs: FRAME_INTERVAL_MS,
    facingMode: 'environment',
    surface: 'scanner',
    // ADR-088 — the manual fallback is the participant's 4-digit scan number, not the
    // nickname: pointing a marshal at a retired path helps nobody in the sun.
    unsupportedMessage: 'Camera unavailable on this device — type their 4-digit number instead.',
    deniedMessage: 'Camera permission denied — type their 4-digit number instead.',
  });

  return {
    videoRef,
    canvasRef,
    isActive: camera.isActive,
    isSupported: camera.isSupported,
    error: camera.error,
    start: camera.start,
    stop: camera.stop,
    // ADR-184 — the marshal's escape hatch when `facingMode` opened the selfie lens.
    cameraLabel: camera.cameraLabel,
    switchCamera: camera.switchCamera,
  };
}
