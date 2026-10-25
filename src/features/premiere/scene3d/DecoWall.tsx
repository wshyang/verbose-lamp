import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { createDecoWallpaperTextures } from '../scene/environment';

/**
 * The tessellated deco wallpaper (ADDENDUM-022 §2.3): builder and material
 * values copied from the manager's constructor — obsidian velvet albedo
 * with gilded ridges, lit by the ballroom environment at 0.42. Sits at
 * z −14.5 inside the Backdrop group, which carries the animated depth.
 */
export function DecoWall() {
  const textures = useMemo(createDecoWallpaperTextures, []);
  const normalScale = useMemo(() => new THREE.Vector2(1.6, 1.6), []);

  useEffect(
    () => () => {
      textures.map.dispose();
      textures.normalMap.dispose();
      textures.roughnessMap.dispose();
    },
    [textures],
  );

  return (
    <mesh position={[0, 0, -14.5]}>
      <planeGeometry args={[46, 26]} />
      <meshStandardMaterial
        map={textures.map}
        metalness={0.72}
        roughness={0.55}
        roughnessMap={textures.roughnessMap}
        normalMap={textures.normalMap}
        normalScale={normalScale}
        envMapIntensity={0.85}
      />
    </mesh>
  );
}
