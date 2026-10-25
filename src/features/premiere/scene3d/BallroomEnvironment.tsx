import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { createBallroomEnvironment } from '../scene/environment';

/**
 * The equirectangular softbox/colonnade environment that gives the gold its
 * anisotropic-looking reflections. Built from the renderer, disposed on unmount.
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
