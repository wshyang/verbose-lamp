import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { createDecoWallpaperTextures } from '../scene/environment';

export const DECO_WALL = {
  size: [46, 26] as [number, number],
  position: [0, 0, -14.5] as [number, number, number],
  normalScale: 1.6,
  metalness: 0.72,
  roughness: 0.55,
  envMapIntensity: 0.85,
} as const;

/**
 * The recessed Art Deco tessellated ballroom wall (ADDENDUM-022 §2.3). The wallpaper maps
 * are the manager's own procedural textures; the material values are the manager's.
 */
export function DecoWall() {
  const textures = useMemo(() => createDecoWallpaperTextures(), []);
  const geometry = useMemo(() => new THREE.PlaneGeometry(...DECO_WALL.size), []);
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
    [textures],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      textures.map.dispose();
      textures.normalMap.dispose();
      textures.roughnessMap.dispose();
    },
    [geometry, material, textures],
  );

  return <mesh name="deco-wall" geometry={geometry} material={material} position={DECO_WALL.position} />;
}
