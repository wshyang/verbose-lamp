import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { createDecoWallpaperTextures } from '../scene/environment';

/** Recessed tessellated ballroom wall, using the delivered texture builder verbatim. */
export function DecoWall() {
  const wall = useMemo(() => {
    const textures = createDecoWallpaperTextures();
    const geometry = new THREE.PlaneGeometry(46, 26);
    const material = new THREE.MeshStandardMaterial({
      map: textures.map,
      normalMap: textures.normalMap,
      normalScale: new THREE.Vector2(1.6, 1.6),
      roughnessMap: textures.roughnessMap,
      metalness: 0.72,
      roughness: 0.55,
      envMapIntensity: 0.85,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, 0, -14.5);
    return { textures, geometry, material, mesh };
  }, []);

  useEffect(
    () => () => {
      wall.geometry.dispose();
      wall.material.dispose();
      wall.textures.map.dispose();
      wall.textures.normalMap.dispose();
      wall.textures.roughnessMap.dispose();
    },
    [wall]
  );

  return <primitive object={wall.mesh} />;
}
