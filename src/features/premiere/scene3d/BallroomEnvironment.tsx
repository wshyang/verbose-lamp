import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { createBallroomEnvironment } from '../scene/environment';

/**
 * The equirectangular ballroom and softbox environment that gives the gold its reflections
 * (ADDENDUM-022 §2.2). Baked once from the live renderer, put on the scene, and released
 * with it. Needs a real GL context, which is why `PremiereScene` takes it as a slot.
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
