import type { RefObject } from 'react';
import type { CameraMode } from '@/features/premiere';
import { detectCoarsePointer } from '@/features/premiere/scene/responsiveLayout';
import type { PremiereStore } from '@/features/premiere/scene3d/premiereStore';
import { PremiereCanvas } from '@/features/premiere/scene3d/PremiereCanvas';
import { cn } from '@/shared/lib/cn';

interface CinematicStageProps {
  mountRef: RefObject<HTMLDivElement | null>;
  store: PremiereStore;
  cameraMode: CameraMode;
  hudHidden: boolean;
}

export function CinematicStage({ mountRef, store, cameraMode, hudHidden }: CinematicStageProps) {
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
        <PremiereCanvas store={store} hasCoarsePointer={detectCoarsePointer()} />
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