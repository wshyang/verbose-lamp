import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, type RootState } from '@react-three/fiber';
import { resolveViewportFit, type ViewportFit } from '../scene/responsiveLayout';
import { applyRendererLook, PREMIERE_CANVAS } from './applyRendererLook';
import { BallroomEnvironment } from './BallroomEnvironment';
import { CinemaComposer } from './CinemaComposer';
import { PremiereScene, type PremiereSceneProps } from './PremiereScene';
import type { PremiereStoreApi } from './premiereStore';

export interface PremiereCanvasProps
  extends Pick<PremiereSceneProps, 'onTelemetry' | 'onChapterChange' | 'onFrameReady'> {
  store: PremiereStoreApi;
  className?: string;
}

/** A coarse pointer means a finger: the fit shrinks the cards and stills the camera. */
export function hasCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}

/**
 * The Canvas (ADDENDUM-022 §2.2). Everything it configures (pixel ratio, antialiasing, the
 * 42 degree lens, ACES tone mapping at 1.18, the near-black background, the exponential fog
 * and the camera's presence in the scene graph) is the manager's, applied once on creation.
 *
 * The fit is tracked here, not in CSS: the cards scale and the camera pulls back on narrow
 * screens, and both are three.js numbers. The GPU-only pieces (environment bake, post
 * pipeline) are passed to the scene as slots.
 */
export function PremiereCanvas({ store, className, ...callbacks }: PremiereCanvasProps) {
  const mount = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState<ViewportFit>(() => resolveViewportFit(1, 1, false));

  useEffect(() => {
    const element = mount.current;
    if (!element) return;
    const measure = () => {
      setFit(
        resolveViewportFit(
          Math.max(1, element.clientWidth),
          Math.max(1, element.clientHeight),
          hasCoarsePointer(),
        ),
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const onCreated = useCallback((state: RootState) => applyRendererLook(state), []);

  return (
    <div ref={mount} className={className} data-testid="premiere-canvas__mount">
      <Canvas
        dpr={PREMIERE_CANVAS.dpr}
        gl={PREMIERE_CANVAS.gl}
        camera={PREMIERE_CANVAS.camera}
        onCreated={onCreated}
      >
        <PremiereScene
          store={store}
          fit={fit}
          environment={<BallroomEnvironment />}
          composer={<CinemaComposer store={store} />}
          {...callbacks}
        />
      </Canvas>
    </div>
  );
}
