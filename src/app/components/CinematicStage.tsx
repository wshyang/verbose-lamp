import type { RefObject } from 'react';
import {
  PremiereCanvas,
  type CameraMode,
  type PlaybackTelemetry,
  type PremiereStoreApi,
} from '@/features/premiere';
import { cn } from '@/shared/lib/cn';

interface CinematicStageProps {
  mountRef: RefObject<HTMLDivElement | null>;
  cameraMode: CameraMode;
  hudHidden: boolean;
  store: PremiereStoreApi;
  onSceneTelemetry?: (telemetry: PlaybackTelemetry) => void;
  onSceneChapterChange?: (chapterIndex: number) => void;
  onSceneFrameReady?: () => void;
}

/**
 * The stage. The container is the contract: it carries the test id, the orbit cursor, the
 * accessible name and the `data-frame-ready` flag the screenshot gate waits on.
 */
export function CinematicStage({
  mountRef,
  cameraMode,
  hudHidden,
  store,
  onSceneTelemetry,
  onSceneChapterChange,
  onSceneFrameReady,
}: CinematicStageProps) {
  return (
    <>
      <div
        ref={mountRef}
        data-testid="cinematic-stage__canvas"
        className={cn(
          'absolute inset-0 h-full w-full',
          cameraMode === 'orbit' && 'cursor-grab active:cursor-grabbing'
        )}
        aria-label="Interactive WebGL title sequence"
      >
        <PremiereCanvas
          store={store}
          className="absolute inset-0 h-full w-full"
          onTelemetry={onSceneTelemetry}
          onChapterChange={onSceneChapterChange}
          onFrameReady={onSceneFrameReady}
        />
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