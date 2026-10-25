import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { createBallroomEnvironment } from '../scene/environment';

/**
 * The PMREM ballroom reflections (ADDENDUM-022 §2.3): built once in an
 * effect and disposed on unmount — the create/dispose pair the manager
 * ran in its constructor/dispose, so gold and platinum keep their
 * softbox glints under R3F exactly as before.
 */
export function BallroomEnvironment() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const envTex = createBallroomEnvironment(gl);
    scene.environment = envTex;
    return () => {
      scene.environment = null;
      envTex.dispose();
    };
  }, [gl, scene]);

  return null;
}
