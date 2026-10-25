import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { createBallroomEnvironment } from '../scene/environment';

/** Installs the PMREM ballroom environment; needs a real WebGL renderer. */
export function BallroomEnvironment() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const environment = createBallroomEnvironment(gl);
    scene.environment = environment;
    return () => {
      if (scene.environment === environment) scene.environment = null;
      environment.dispose();
    };
  }, [gl, scene]);

  return null;
}
