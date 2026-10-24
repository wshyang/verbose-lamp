import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useSelfieCamera } from './useSelfieCamera.js';

/**
 * ADR-042 — the selfie viewfinder's brain. jsdom has no camera, no canvas and no
 * FaceDetector, which is exactly the iOS half of the story (ADR-041), so the fallback
 * behaviours are pinned first: unsupported and denied cameras explain themselves and
 * point at the upload path, a detector-less browser never grows a face box, and a
 * detector that throws is the same as none. The browser boundary (camera, canvas,
 * detector) is substituted; everything the hook decides is real.
 */

const originalMediaDevices = navigator.mediaDevices;
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const originalToBlob = HTMLCanvasElement.prototype.toBlob;
const originalPlay = HTMLMediaElement.prototype.play;

function installCamera(options: { videoWidth?: number; videoHeight?: number } = {}) {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  HTMLCanvasElement.prototype.getContext = vi.fn(() =>
    ({ drawImage: vi.fn() }) as unknown as CanvasRenderingContext2D,
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toBlob = vi.fn(function (this: HTMLCanvasElement, resolve) {
    resolve(new Blob(['frame'], { type: 'image/png' }));
  }) as unknown as typeof HTMLCanvasElement.prototype.toBlob;

  const video = document.createElement('video');
  Object.defineProperty(video, 'readyState', { configurable: true, value: video.HAVE_ENOUGH_DATA });
  Object.defineProperty(video, 'videoWidth', { configurable: true, value: options.videoWidth ?? 400 });
  Object.defineProperty(video, 'videoHeight', { configurable: true, value: options.videoHeight ?? 800 });
  return { video, canvas: document.createElement('canvas'), track, getUserMedia };
}

function stubDetector(detect: () => Promise<{ boundingBox: DOMRectInit }[]>) {
  vi.stubGlobal(
    'FaceDetector',
    class {
      detect = detect;
    },
  );
}

afterEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: originalMediaDevices,
  });
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  HTMLCanvasElement.prototype.toBlob = originalToBlob;
  HTMLMediaElement.prototype.play = originalPlay;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function startedCamera(options: { videoWidth?: number; videoHeight?: number } = {}) {
  const { video, canvas, track } = installCamera(options);
  const rendered = renderHook(() => useSelfieCamera());
  rendered.result.current.videoRef.current = video;
  rendered.result.current.canvasRef.current = canvas;
  act(() => rendered.result.current.start());
  await waitFor(() => expect(rendered.result.current.isActive).toBe(true));
  return { rendered, track };
}

describe('useSelfieCamera', () => {
  it('reports unsupported without a camera API and points at the upload path', () => {
    const { result } = renderHook(() => useSelfieCamera());
    expect(result.current.isSupported).toBe(false);

    act(() => result.current.start());
    expect(result.current.error).toContain('choose a photo instead');
    expect(result.current.isActive).toBe(false);
  });

  it('explains a denied permission instead of failing silently', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    const { result } = renderHook(() => useSelfieCamera());

    act(() => result.current.start());
    await waitFor(() => expect(result.current.error).toContain('choose a photo instead'));
    expect(result.current.isActive).toBe(false);
  });

  it('asks for the FRONT camera — this is a selfie, not a badge scan', async () => {
    const { video, canvas, getUserMedia } = installCamera();
    const { result } = renderHook(() => useSelfieCamera());
    result.current.videoRef.current = video;
    result.current.canvasRef.current = canvas;

    act(() => result.current.start());
    await waitFor(() => expect(result.current.isActive).toBe(true));
    expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: 'user' } });
  });

  it('follows the face as fractions of the frame, ready for any preview size', async () => {
    stubDetector(async () => [{ boundingBox: { x: 100, y: 200, width: 200, height: 400 } }]);
    const { rendered } = await startedCamera({ videoWidth: 400, videoHeight: 800 });

    expect(rendered.result.current.hasDetector).toBe(true);
    await waitFor(() =>
      expect(rendered.result.current.faceBox).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 }),
    );
  });

  it('never grows a face box without a detector — the iOS Safari case', async () => {
    const { rendered } = await startedCamera();

    expect(rendered.result.current.hasDetector).toBe(false);
    // Give the frame timer two full beats to prove nothing appears.
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(rendered.result.current.faceBox).toBeNull();
  });

  it('treats a throwing detector as no face, not a crash', async () => {
    stubDetector(async () => {
      throw new Error('no permission');
    });
    const { rendered } = await startedCamera();

    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(rendered.result.current.faceBox).toBeNull();
    expect(rendered.result.current.isActive).toBe(true);
  });

  it('captures the current frame as a Blob for the same ladder an upload walks', async () => {
    const { rendered } = await startedCamera();

    const photo = await rendered.result.current.capture();
    expect(photo).not.toBeNull();
    expect(photo?.type).toBe('image/png');
  });

  it('captures nothing before the camera has a frame', async () => {
    const { result } = renderHook(() => useSelfieCamera());
    expect(await result.current.capture()).toBeNull();
  });

  it('stops the camera track and clears the box on stop', async () => {
    stubDetector(async () => [{ boundingBox: { x: 0, y: 0, width: 400, height: 800 } }]);
    const { rendered, track } = await startedCamera();
    await waitFor(() => expect(rendered.result.current.faceBox).not.toBeNull());

    act(() => rendered.result.current.stop());
    expect(track.stop).toHaveBeenCalled();
    expect(rendered.result.current.faceBox).toBeNull();
    expect(rendered.result.current.isActive).toBe(false);
  });
});
