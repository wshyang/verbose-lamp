import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deviceIdOf,
  describeCamera,
  nextCamera,
  videoConstraints,
  videoInputsOf,
  type CameraOption,
} from '../camera/choice.js';
import {
  forgetCameraDevice,
  readCameraDevice,
  writeCameraDevice,
  type CameraSurface,
} from '../storage/cameraStore.js';

/**
 * One camera, owned properly: permission, playback, a frame timer, and teardown that
 * never leaks a MediaStream track. Extracted from the QR scanner (F26) when the selfie
 * viewfinder (ADR-042) needed the identical lifecycle pointed at the other lens.
 *
 * `isSupported: false` is a normal state, not an error — a denied camera on a beach
 * must never block the page's manual alternative, so the copy for both refusals comes
 * from the caller, who knows what that alternative is.
 */

export interface CameraSessionState {
  isActive: boolean;
  isSupported: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
  /** ADR-184 — every camera this browser admits to, once permission has been granted. */
  cameras: CameraOption[];
  /** What the live track says it opened — not what was asked for. */
  activeDeviceId: string | null;
  /** Human-readable position of the lens in use, for the switch control's label. */
  cameraLabel: string;
  /** Null when there is nothing to switch to, which is what hides the control. */
  switchCamera: (() => void) | null;
}

/** Point the element at the stream; a refused autoplay is not an error, just a tap away. */
async function playInto(video: HTMLVideoElement | null, stream: MediaStream): Promise<void> {
  if (video === null) return;
  video.srcObject = stream;
  await video.play().catch(() => undefined);
}

/**
 * Open one specific camera, or whatever the facing hint produces.
 *
 * Separate from the hook so that the retry below reads as the two attempts it is. A remembered
 * camera that no longer exists is ordinary rather than exceptional — a borrowed phone, an
 * unplugged webcam, a browser that rotated its deviceIds after a permission reset — and
 * `exact` is what makes that failure loud enough to catch and recover from instead of silently
 * opening some other lens.
 */
function openCamera(
  deviceId: string | null,
  facingMode: 'user' | 'environment',
): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ video: videoConstraints(deviceId, facingMode) });
}

/**
 * ADR-184 — which cameras exist, and which one is actually live.
 *
 * Its own hook so `useCameraSession` stays readable, and because the two facts it holds are
 * answered by different APIs at different moments: the live device comes off the track the
 * instant a stream opens, the list comes from `enumerateDevices` and is only worth asking for
 * afterwards.
 */
function useCameraInventory(surface: CameraSurface) {
  const [cameras, setCameras] = useState<CameraOption[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);

  const record = useCallback(
    (stream: MediaStream) => {
      /*
       * Ask the TRACK which camera opened rather than believing the request. When `facingMode`
       * was ignored the two disagree, and that disagreement is the entire bug this addresses,
       * so only the stream's own answer is recorded.
       */
      const opened = deviceIdOf(stream);
      setActiveDeviceId(opened);
      if (opened !== null) writeCameraDevice(surface, opened);
      /*
       * Enumerate only now. Before permission is granted labels are empty strings and some
       * browsers report a single placeholder device, so a list built earlier would be both
       * unhelpful and wrong about how many cameras there are.
       */
      if (typeof navigator.mediaDevices.enumerateDevices !== 'function') {
        // No way to ask what else exists, so there is nothing to offer a switch between.
        setCameras([]);
        return;
      }
      void navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => setCameras(videoInputsOf(devices)))
        .catch(() => setCameras([]));
    },
    [surface],
  );

  return { cameras, activeDeviceId, record };
}

/**
 * The stream itself: playing it, the frame timer, and a teardown that never leaks a track.
 *
 * Unchanged in behaviour from the original hook — lifted out whole so `useCameraSession` has
 * room for the lens-choosing ADR-184 added around it.
 */
function useStreamLifecycle(input: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onFrame: () => void;
  frameIntervalMs: number;
  record: (stream: MediaStream) => void;
}) {
  const { videoRef, onFrame, frameIntervalMs, record } = input;
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isActive, setIsActive] = useState(false);

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsActive(false);
  }, []);

  const attachStream = useCallback(
    async (stream: MediaStream) => {
      streamRef.current = stream;
      await playInto(videoRef.current, stream);
      setIsActive(true);
      timerRef.current = setInterval(onFrame, frameIntervalMs);
      record(stream);
    },
    [frameIntervalMs, onFrame, record, videoRef],
  );

  const markInactive = useCallback(() => setIsActive(false), []);
  return { isActive, markInactive, stop, attachStream };
}

/**
 * Open the preferred camera, falling back to the facing hint if it has vanished.
 *
 * Module-level rather than inline so the two attempts read as two attempts. `wantedRef` is
 * mutated here on purpose: once a remembered camera has failed, every later `start` in this
 * page's life should skip straight to the hint rather than pay the failure again.
 */
async function beginSession(args: {
  wantedRef: React.MutableRefObject<string | null>;
  facingMode: 'user' | 'environment';
  surface: CameraSurface;
  attach: (stream: MediaStream) => Promise<void>;
  onRefused: () => void;
}): Promise<void> {
  try {
    await args.attach(await openCamera(args.wantedRef.current, args.facingMode));
  } catch {
    if (args.wantedRef.current === null) {
      args.onRefused();
      return;
    }
    // The remembered camera is gone: a borrowed phone, an unplugged webcam, rotated ids.
    args.wantedRef.current = null;
    forgetCameraDevice(args.surface);
    try {
      await args.attach(await openCamera(null, args.facingMode));
    } catch {
      args.onRefused();
    }
  }
}

/**
 * ADR-184 — the switch control, or null when there is nothing to switch to.
 *
 * Restarts rather than calling `applyConstraints`: changing the physical device on a live track
 * is patchily supported and fails in exactly the drivers that made this necessary, whereas
 * tearing the stream down and opening another always works. The flicker is the honest cost of
 * the thing the participant just asked for.
 */
function useCameraSwitch(args: {
  target: string | null;
  surface: CameraSurface;
  wantedRef: React.MutableRefObject<string | null>;
  stop: () => void;
  start: () => void;
}): (() => void) | null {
  const { target, surface, wantedRef, stop } = args;
  /* `start` is recreated whenever its inputs move; the ref keeps the callback stable. */
  const startRef = useRef(args.start);
  startRef.current = args.start;

  const run = useCallback(() => {
    if (target === null) return;
    wantedRef.current = target;
    writeCameraDevice(surface, target);
    stop();
    startRef.current();
  }, [stop, surface, target, wantedRef]);

  return target === null ? null : run;
}

/** jsdom, an insecure origin and an old browser all land here, and none of them is an error. */
function cameraIsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
}

/** The permission dance and the copy that goes with each way it can fail. */
function useCameraStart(args: {
  input: { facingMode: 'user' | 'environment'; surface: CameraSurface; unsupportedMessage: string; deniedMessage: string };
  isSupported: boolean;
  attachStream: (stream: MediaStream) => Promise<void>;
  markInactive: () => void;
  wantedRef: React.MutableRefObject<string | null>;
}) {
  const { isSupported, attachStream, markInactive, wantedRef } = args;
  const { facingMode, surface, unsupportedMessage, deniedMessage } = args.input;
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(() => {
    if (!isSupported) {
      setError(unsupportedMessage);
      return;
    }
    setError(null);
    const onRefused = () => {
      setError(deniedMessage);
      markInactive();
    };
    void beginSession({ wantedRef, facingMode, surface, attach: attachStream, onRefused });
  }, [
    attachStream,
    deniedMessage,
    facingMode,
    isSupported,
    markInactive,
    surface,
    unsupportedMessage,
    wantedRef,
  ]);

  return { error, start };
}

export function useCameraSession(input: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onFrame: () => void;
  frameIntervalMs: number;
  facingMode: 'user' | 'environment';
  unsupportedMessage: string;
  deniedMessage: string;
  /** ADR-184 — which remembered-camera key this viewfinder owns. */
  surface: CameraSurface;
}): CameraSessionState {
  const { surface } = input;
  const inventory = useCameraInventory(surface);
  const { isActive, markInactive, stop, attachStream } = useStreamLifecycle({
    videoRef: input.videoRef,
    onFrame: input.onFrame,
    frameIntervalMs: input.frameIntervalMs,
    record: inventory.record,
  });
  /** The preference in play right now. Seeded from storage, moved by the switch control. */
  const wantedRef = useRef<string | null>(readCameraDevice(surface));
  const isSupported = cameraIsSupported();
  const { error, start } = useCameraStart({ input, isSupported, attachStream, markInactive, wantedRef });

  const switchCamera = useCameraSwitch({
    target: nextCamera(inventory.cameras, inventory.activeDeviceId),
    surface,
    wantedRef,
    stop,
    start,
  });

  useEffect(() => stop, [stop]);

  return {
    isActive,
    isSupported,
    error,
    start,
    stop,
    cameras: inventory.cameras,
    activeDeviceId: inventory.activeDeviceId,
    cameraLabel: describeCamera(inventory.cameras, inventory.activeDeviceId),
    switchCamera,
  };
}
