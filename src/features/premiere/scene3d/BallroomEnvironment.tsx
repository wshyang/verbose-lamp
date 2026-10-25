import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { createBallroomEnvironment } from '../scene/environment';

/**
 * The baked ballroom environment map (ADDENDUM-022 §6 step 2.3). It is a real GPU
 * render — a cube camera over a procedural room — so it is created once on mount and
 * disposed with the canvas. Every gold material in the scene reads it.
 */
export function BallroomEnvironment() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const texture = createBallroomEnvironment(gl);
    scene.environment = texture;
    return () => {
      scene.environment = null;
      texture.dispose();
    };
  }, [gl, scene]);

  return null;
}
