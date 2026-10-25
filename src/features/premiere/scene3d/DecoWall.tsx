import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { createDecoWallpaperTextures } from '../scene/environment';

/** The recessed tessellated ballroom wall behind every chamber. Values copied verbatim. */
export const DECO_WALL = {
  size: [46, 26] as [number, number],
  position: [0, 0, -14.5] as [number, number, number],
  normalScale: 1.6,
  metalness: 0.72,
  roughness: 0.55,
  envMapIntensity: 0.85,
} as const;

/**
 * `GatsbySceneManager` built this inline (ADDENDUM-022 §6 step 2.3). The texture set is
 * generated, so it is memoised and disposed with the component.
 */
export function DecoWall() {
  const textures = useMemo(() => createDecoWallpaperTextures(), []);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: textures.map,
        normalMap: textures.normalMap,
        normalScale: new THREE.Vector2(DECO_WALL.normalScale, DECO_WALL.normalScale),
        roughnessMap: textures.roughnessMap,
        metalness: DECO_WALL.metalness,
        roughness: DECO_WALL.roughness,
        envMapIntensity: DECO_WALL.envMapIntensity,
      }),
    [textures]
  );

  const geometry = useMemo(() => new THREE.PlaneGeometry(...DECO_WALL.size), []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      textures.map.dispose();
      textures.normalMap.dispose();
      textures.roughnessMap.dispose();
    },
    [geometry, material, textures]
  );

  return (
    <mesh
      name="deco-wall"
      geometry={geometry}
      material={material}
      position={DECO_WALL.position}
    />
  );
}
