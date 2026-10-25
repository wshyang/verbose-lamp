import { useCallback, type RefObject } from 'react';
import {
  PremiereCanvas,
  type CameraMode,
  type PlaybackTelemetry,
  type PremiereStore,
} from '@/features/premiere';
import { cn } from '@/shared/lib/cn';

interface CinematicStageProps {
  mountRef: RefObject<HTMLDivElement | null>;
  cameraMode: CameraMode;
  hudHidden: boolean;
  store: PremiereStore | null;
  onTelemetry: (telemetry: PlaybackTelemetry) => void;
  onChapterChange: (index: number) => void;
}

/**
 * The WebGL stage (ADDENDUM-022 §2.4): the R3F canvas lives inside the
 * same testid div the imperative renderer mounted into, inheriting its
 * aria-label and orbit cursor. A null store (controller test doubles)
 * leaves the stage empty. Frozen renders flag `data-frame-ready` on
 * this div once three frames are up — the screenshot handshake e2e uses.
 */
export function CinematicStage({
  mountRef,
  cameraMode,
  hudHidden,
  store,
  onTelemetry,
  onChapterChange,
}: CinematicStageProps) {
  const handleFrameReady = useCallback(() => {
    if (mountRef.current) mountRef.current.dataset.frameReady = 'true';
  }, [mountRef]);

  const canvas = store ? (
    <PremiereCanvas
      store={store}
      onTelemetry={onTelemetry}
      onChapterChange={onChapterChange}
      onFrameReady={handleFrameReady}
    />
  ) : null;

  return (
    <>
      <div
        ref={mountRef}
        className={cn(
          'absolute inset-0 h-full w-full',
          cameraMode === 'orbit' && 'cursor-grab active:cursor-grabbing'
        )}
        aria-label="Interactive WebGL title sequence"
        data-testid="cinematic-stage__canvas"
      >
        {canvas}
      </div>
      <div
        className={cn(
          'pointer-events-none absolute inset-3 border border-[#d4af37]/20 transition-opacity duration-500 sm:inset-5',
          hudHidden ? 'opacity-0' : 'opacity-100'
        )}
        aria-hidden="true"
      >
        <span className="absolute -left-px -top-px h-4 w-4 border-l-2 border-t-2 border-[#f8e29b]/60" />
        <span className="absolute -right-px -top-px h-4 w-4 border-r-2 border-t-2 border-[#f8e29b]/60" />
        <span className="absolute -bottom-px -left-px h-4 w-4 border-b-2 border-l-2 border-[#f8e29b]/60" />
        <span className="absolute -bottom-px -right-px h-4 w-4 border-b-2 border-r-2 border-[#f8e29b]/60" />
      </div>
    </>
  );
}
