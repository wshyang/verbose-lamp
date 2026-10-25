import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { createBallroomEnvironment } from '../scene/environment';

/**
 * The equirectangular ballroom/softbox environment that gives the gold its reflections
 * (ADDENDUM-022 §6.3). Built once from the live renderer and disposed with the scene.
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
