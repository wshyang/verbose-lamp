import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { resolveViewportFit, type ViewportFit } from '../scene/responsiveLayout';
import { applyRendererLook, PREMIERE_CANVAS } from './applyRendererLook';
import { PremiereScene, type PremiereSceneProps } from './PremiereScene';
import type { PremiereStore } from './premiereStore';

export interface PremiereCanvasProps extends Omit<PremiereSceneProps, 'fit'> {
  store: PremiereStore;
  /** The host div: it carries the test id, the cursor class and `data-frame-ready`. */
  containerRef?: { current: HTMLDivElement | null };
  className?: string;
  withEnvironment?: boolean;
  withComposer?: boolean;
}

/** A coarse pointer means a finger: the fit shrinks the cards and stills the camera. */
export function hasCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}

/**
 * The Canvas (ADDENDUM-022 §6 step 2.2). Everything it configures — dpr, antialiasing,
 * the 42° lens, ACES tone mapping at 1.18, the near-black background, the exponential
 * fog and the camera's presence in the scene graph — is copied from the manager.
 *
 * The fit is tracked here rather than in CSS: the cards scale and the camera pulls back
 * on narrow screens, and both are three.js numbers.
 */
export function PremiereCanvas({
  store,
  containerRef,
  className,
  withEnvironment,
  withComposer,
  ...sceneProps
}: PremiereCanvasProps) {
  const wrapper = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState<ViewportFit>(() => resolveViewportFit(1, 1, false));

  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    const measure = () => {
      const width = Math.max(1, element.clientWidth);
      const height = Math.max(1, element.clientHeight);
      setFit(resolveViewportFit(width, height, hasCoarsePointer()));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const onCreated = useCallback(
    (state: { gl: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.Camera }) => {
      applyRendererLook(state);
    },
    []
  );

  return (
    <div ref={wrapper} className={className} data-testid="premiere-canvas__mount">
      <Canvas
        dpr={PREMIERE_CANVAS.dpr}
        gl={PREMIERE_CANVAS.gl}
        camera={PREMIERE_CANVAS.camera}
        onCreated={onCreated}
      >
        <PremiereScene
          store={store}
          fit={fit}
          containerRef={containerRef}
          withEnvironment={withEnvironment}
          withComposer={withComposer}
          {...sceneProps}
        />
        <SizeReporter fit={fit} />
      </Canvas>
    </div>
  );
}

/** Keeps the fit in step with the canvas the renderer actually got. */
function SizeReporter({ fit }: { fit: ViewportFit }) {
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera;
    perspective.aspect = fit.aspect;
    perspective.updateProjectionMatrix();
  }, [camera, fit.aspect]);
  return null;
}
