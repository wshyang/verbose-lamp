import { useCallback, useRef, useState } from 'react';
import { useCameraSession } from './useCameraSession.js';

/**
 * ADR-042 — "take a selfie now". The front camera streams into a live viewfinder;
 * where the browser ships a FaceDetector (Chrome on Android) the face boundary is
 * drawn over the preview as the participant lines up, and everywhere else — iOS
 * Safari ships no detector, ADR-041 — a fixed oval guide stands in. Capture pulls
 * one frame off the video and hands back a Blob for the SAME conversion ladder an
 * uploaded photo walks (colour cut-out, then the model): the live boundary is a
 * viewfinder aid, never a second pipeline.
 */

const FACE_INTERVAL_MS = 300;

/** Where the face is, as fractions of the frame, so the overlay scales with the preview. */
export interface SelfieFaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DetectedFace {
  boundingBox: { x: number; y: number; width: number; height: number };
}

interface FaceDetectorLike {
  detect: (source: unknown) => Promise<DetectedFace[]>;
}

function detectorClass(): (new () => FaceDetectorLike) | undefined {
  return (globalThis as { FaceDetector?: new () => FaceDetectorLike }).FaceDetector;
}

/** The current video frame drawn onto the work canvas, or null before first light. */
function frameOnto(video: HTMLVideoElement | null, canvas: HTMLCanvasElement | null) {
  if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) return null;
  if (video.videoWidth === 0 || video.videoHeight === 0) return null;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export interface SelfieCameraState {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isActive: boolean;
  isSupported: boolean;
  /** True when a live boundary can be drawn at all; false means show the oval guide. */
  hasDetector: boolean;
  faceBox: SelfieFaceBox | null;
  error: string | null;
  start: () => void;
  stop: () => void;
  /** One frame, as a Blob the photo ladder accepts; null when the camera has no frame yet. */
  capture: () => Promise<Blob | null>;
  /** ADR-184 — position of the lens in use, e.g. "Camera 2 of 3 — Front Camera". */
  cameraLabel: string;
  /** Null when this device has nothing to switch to, which hides the control. */
  switchCamera: (() => void) | null;
}

/** One detector pass over one frame; every failure is "no face", never a crash. */
async function detectInto(
  detector: FaceDetectorLike,
  frame: HTMLCanvasElement,
  onBox: (box: SelfieFaceBox | null) => void,
): Promise<void> {
  try {
    const [face] = await detector.detect(frame);
    onBox(
      face === undefined
        ? null
        : {
            x: face.boundingBox.x / frame.width,
            y: face.boundingBox.y / frame.height,
            width: face.boundingBox.width / frame.width,
            height: face.boundingBox.height / frame.height,
          },
    );
  } catch {
    onBox(null);
  }
}

export function useSelfieCamera(): SelfieCameraState {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busyRef = useRef(false);
  const [faceBox, setFaceBox] = useState<SelfieFaceBox | null>(null);
  const hasDetector = detectorClass() !== undefined;

  // A detector frame is milliseconds, but never let a slow one stack behind itself.
  const findFace = useCallback(() => {
    const available = detectorClass();
    const frame = available ? frameOnto(videoRef.current, canvasRef.current) : null;
    if (!available || frame === null || busyRef.current) return;
    busyRef.current = true;
    void detectInto(new available(), frame, setFaceBox).finally(() => {
      busyRef.current = false;
    });
  }, []);

  const camera = useCameraSession({
    videoRef,
    onFrame: findFace,
    frameIntervalMs: FACE_INTERVAL_MS,
    facingMode: 'user',
    surface: 'selfie',
    unsupportedMessage: 'No camera on this device — choose a photo instead.',
    deniedMessage: 'Camera permission denied — choose a photo instead.',
  });

  const capture = useCallback(async (): Promise<Blob | null> => {
    const frame = frameOnto(videoRef.current, canvasRef.current);
    if (frame === null) return null;
    return new Promise((resolve) => frame.toBlob((blob) => resolve(blob), 'image/png'));
  }, []);

  const stop = useCallback(() => {
    camera.stop();
    setFaceBox(null);
  }, [camera]);

  return {
    videoRef,
    canvasRef,
    isActive: camera.isActive,
    isSupported: camera.isSupported,
    hasDetector,
    faceBox,
    error: camera.error,
    start: camera.start,
    stop,
    capture,
    // ADR-184 — the front lens is also only a hint; a laptop with two webcams gets this wrong.
    cameraLabel: camera.cameraLabel,
    switchCamera: camera.switchCamera,
  };
}
