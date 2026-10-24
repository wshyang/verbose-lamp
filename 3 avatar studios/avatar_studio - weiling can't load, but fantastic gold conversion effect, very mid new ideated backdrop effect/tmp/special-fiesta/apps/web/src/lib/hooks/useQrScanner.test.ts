import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import QRCode from 'qrcode';
import { useQrScanner } from './useQrScanner.js';

/**
 * jsdom has no camera. That is exactly the case the beach has to survive, so the tests pin
 * the fallback behaviour first: report unsupported, never throw, leave manual entry to the
 * page. The decode path is then driven with a *real* QR bitmap rendered from the same
 * `qrcode` library the participant badge uses, so jsQR is exercised for real — only the
 * browser boundary (camera, canvas) is substituted.
 */

const originalMediaDevices = navigator.mediaDevices;
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const originalPlay = HTMLMediaElement.prototype.play;

/** jsdom ships no canvas, so a frame is just the {data,width,height} triple jsQR reads. */
type Frame = Pick<ImageData, 'data' | 'width' | 'height'>;

function blankFrame(side = 8): Frame {
  return { data: new Uint8ClampedArray(side * side * 4).fill(255), width: side, height: side };
}

/** Renders `text` as the pixel buffer a camera frame would contain. */
function qrFrame(text: string): Frame {
  const scale = 4;
  const quiet = 4;
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const side = (size + quiet * 2) * scale;
  const pixels = new Uint8ClampedArray(side * side * 4).fill(255);
  const paint = (row: number, col: number) => {
    for (let offset = 0; offset < scale * scale; offset += 1) {
      const x = (col + quiet) * scale + (offset % scale);
      const y = (row + quiet) * scale + Math.floor(offset / scale);
      const at = (y * side + x) * 4;
      pixels[at] = 0;
      pixels[at + 1] = 0;
      pixels[at + 2] = 0;
    }
  };
  for (let module = 0; module < size * size; module += 1) {
    if (qr.modules.data[module]) paint(Math.floor(module / size), module % size);
  }
  return { data: pixels, width: side, height: side };
}

interface CameraOptions {
  frame?: Frame | null;
  hasContext?: boolean;
  readyState?: number;
}

function installCamera(options: CameraOptions = {}) {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  });
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  HTMLCanvasElement.prototype.getContext = vi.fn(() =>
    options.hasContext === false
      ? null
      : ({
          drawImage: vi.fn(),
          getImageData: () => options.frame ?? blankFrame(),
        } as unknown as CanvasRenderingContext2D),
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;

  const video = document.createElement('video');
  Object.defineProperty(video, 'readyState', {
    configurable: true,
    value: options.readyState ?? video.HAVE_ENOUGH_DATA,
  });
  Object.defineProperty(video, 'videoWidth', { configurable: true, value: options.frame?.width ?? 1 });
  Object.defineProperty(video, 'videoHeight', { configurable: true, value: options.frame?.height ?? 1 });
  return { video, canvas: document.createElement('canvas'), track };
}

afterEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: originalMediaDevices,
  });
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  HTMLMediaElement.prototype.play = originalPlay;
  vi.restoreAllMocks();
});

describe('useQrScanner', () => {
  it('reports that scanning is unsupported without a camera API', () => {
    const { result } = renderHook(() => useQrScanner(vi.fn()));
    expect(result.current.isSupported).toBe(false);

    act(() => result.current.start());
    // ADR-088 — the fallback it points at is the 4-digit scan number, not the nickname.
    expect(result.current.error).toContain('type their 4-digit number instead');
    expect(result.current.isActive).toBe(false);
  });

  it('explains a denied permission instead of failing silently', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    const { result } = renderHook(() => useQrScanner(vi.fn()));
    expect(result.current.isSupported).toBe(true);

    act(() => result.current.start());

    await waitFor(() => expect(result.current.error).toContain('Camera permission denied'));
    expect(result.current.isActive).toBe(false);
  });
});

describe('useQrScanner decoding', () => {
  it('reads a badge off the camera once and blocks the immediate repeat', async () => {
    const frame = qrFrame('BeachBoss');
    const camera = installCamera({ frame });
    const onDecoded = vi.fn();
    const { result } = renderHook(() => useQrScanner(onDecoded));
    result.current.videoRef.current = camera.video;
    result.current.canvasRef.current = camera.canvas;

    act(() => result.current.start());
    await waitFor(() => expect(result.current.isActive).toBe(true));
    await waitFor(() => expect(onDecoded).toHaveBeenCalledWith('BeachBoss'), { timeout: 2000 });

    // The same badge stays in front of the lens for several more frames.
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(onDecoded).toHaveBeenCalledTimes(1);

    act(() => result.current.stop());
    expect(result.current.isActive).toBe(false);
    expect(camera.track.stop).toHaveBeenCalled();
  });

  it('decodes nothing from a blank frame, an unready video or a canvas without a context', async () => {
    const onDecoded = vi.fn();
    const blank = installCamera({});
    const { result, unmount } = renderHook(() => useQrScanner(onDecoded));
    result.current.videoRef.current = blank.video;
    result.current.canvasRef.current = blank.canvas;
    act(() => result.current.start());
    await waitFor(() => expect(result.current.isActive).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(onDecoded).not.toHaveBeenCalled();
    unmount();

    const contextless = installCamera({ hasContext: false });
    const second = renderHook(() => useQrScanner(onDecoded));
    second.result.current.videoRef.current = contextless.video;
    second.result.current.canvasRef.current = contextless.canvas;
    act(() => second.result.current.start());
    await waitFor(() => expect(second.result.current.isActive).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(onDecoded).not.toHaveBeenCalled();
    second.unmount();

    const unready = installCamera({ frame: qrFrame('BeachBoss'), readyState: 0 });
    const third = renderHook(() => useQrScanner(onDecoded));
    third.result.current.videoRef.current = unready.video;
    third.result.current.canvasRef.current = null;
    act(() => third.result.current.start());
    await waitFor(() => expect(third.result.current.isActive).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(onDecoded).not.toHaveBeenCalled();
    third.unmount();
  });

  it('survives a camera that starts before the video element is mounted', async () => {
    installCamera({});
    const { result } = renderHook(() => useQrScanner(vi.fn()));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.isActive).toBe(true));
    act(() => result.current.stop());
    expect(result.current.isActive).toBe(false);
  });
});
