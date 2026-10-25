import type { RefObject } from 'react';
import type { CameraMode } from '@/features/premiere';
import type { PremiereRuntime } from '@/features/premiere/hooks/usePremiereRuntime';
import { PremiereCanvas } from '@/features/premiere/scene3d';
import { cn } from '@/shared/lib/cn';

interface CinematicStageProps {
  mountRef: RefObject<HTMLDivElement | null>;
  cameraMode: CameraMode;
  hudHidden: boolean;
  runtime: PremiereRuntime;
}

export function CinematicStage({ mountRef, cameraMode, hudHidden, runtime }: CinematicStageProps) {
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
        {runtime.renderer === 'r3f' && runtime.store ? (
          <PremiereCanvas store={runtime.store} {...runtime.sceneCallbacks} />
        ) : null}
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