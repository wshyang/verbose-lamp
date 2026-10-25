import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mulberry32 } from '@/shared/lib/random';
import { createDecoWallpaperTextures } from '../scene/environment';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { greenLight, rigAnchors, searchlightSway } from '../scene/choreography';
import { createSearchlightTexture } from './searchlightTexture';
import {
  GOLD_DUST_FRAGMENT,
  GOLD_DUST_VERTEX,
  GREEN_LIGHT_FRAGMENT,
  QUAD_VERTEX,
} from './shaders';
import type { PremiereStoreApi } from './premiereStore';

/** Fixed seed, so the dust field is identical on every load (ADDENDUM-022 §0.1). */
export const DUST_SEED = 1920;
export const DUST_COUNT = 950;

/** The recessed tessellated ballroom wall behind the active chamber. */
function DecoWall() {
  const textures = useMemo(() => createDecoWallpaperTextures(), []);
  useEffect(() => () => {
    textures.map.dispose();
    textures.normalMap.dispose();
    textures.roughnessMap.dispose();
  }, [textures]);

  return (
    <mesh position={[0, 0, -14.5]}>
      <planeGeometry args={[46, 26]} />
      <meshStandardMaterial
        map={textures.map}
        normalMap={textures.normalMap}
        normalScale={new THREE.Vector2(1.6, 1.6)}
        roughnessMap={textures.roughnessMap}
        metalness={0.72}
        roughness={0.55}
        envMapIntensity={0.85}
      />
    </mesh>
  );
}

/** Two additive volumetric cones that sweep the gold chamfers. */
function Searchlights({ store }: { store: PremiereStoreApi }) {
  const left = useRef<THREE.Mesh>(null);
  const right = useRef<THREE.Mesh>(null);
  const material = useMemo(() => {
    const texture = new THREE.CanvasTexture(createSearchlightTexture());
    return new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }, []);
  useEffect(() => () => {
    material.map?.dispose();
    material.dispose();
  }, [material]);

  useFrame(() => {
    const sway = searchlightSway(store.getState().elapsed);
    if (left.current) left.current.rotation.z = sway.left;
    if (right.current) right.current.rotation.z = sway.right;
  });

  return (
    <>
      <mesh ref={left} position={[-6.5, -4, -9.5]} rotation={[0, 0, -0.38]} material={material}>
        <planeGeometry args={[7.5, 26]} />
      </mesh>
      <mesh ref={right} position={[6.5, -4, -9.5]} rotation={[0, 0, 0.38]} material={material}>
        <planeGeometry args={[7.5, 26]} />
      </mesh>
    </>
  );
}

/** The distant emerald dock light across the dark bay. */
function GreenLight({ store }: { store: PremiereStoreApi }) {
  const mesh = useRef<THREE.Mesh>(null);
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uIntensity: { value: 1 } }),
    []
  );

  useFrame(() => {
    const scene = store.getState();
    const light = greenLight({
      t: scene.currentTime,
      heroZ: SEQUENCE_CHAPTERS[SEQUENCE_CHAPTERS.length - 1].zPosition,
    });
    uniforms.uTime.value = scene.elapsed;
    uniforms.uIntensity.value = light.intensity;
    if (!mesh.current) return;
    mesh.current.position.z = light.z;
    mesh.current.visible = light.intensity > 0.01;
  });

  return (
    <mesh ref={mesh} position={[0, -0.15, -9.5]}>
      <planeGeometry args={[14, 10]} />
      <shaderMaterial
        uniforms={uniforms}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        vertexShader={QUAD_VERTEX}
        fragmentShader={GREEN_LIGHT_FRAGMENT}
      />
    </mesh>
  );
}

/** Champagne gold dust and diamond confetti, spawned from the seeded PRNG. */
function GoldDust({ store }: { store: PremiereStoreApi }) {
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uCamZ: { value: 10 } }), []);
  const geometry = useMemo(() => {
    const random = mulberry32(DUST_SEED);
    const positions = new Float32Array(DUST_COUNT * 3);
    const scales = new Float32Array(DUST_COUNT);
    const phases = new Float32Array(DUST_COUNT);
    for (let i = 0; i < DUST_COUNT; i += 1) {
      positions[i * 3] = (random() - 0.5) * 24;
      positions[i * 3 + 1] = (random() - 0.5) * 14;
      positions[i * 3 + 2] = 12 - random() * 136; // spans the whole theatrical Z corridor
      scales[i] = 0.4 + random() * 1.8;
      phases[i] = random() * Math.PI * 2;
    }
    const dust = new THREE.BufferGeometry();
    dust.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    dust.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    dust.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    return dust;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const camera = useThree((state) => state.camera);
  useFrame(() => {
    uniforms.uTime.value = store.getState().elapsed;
    uniforms.uCamZ.value = camera.position.z;
  });

  return (
    <points geometry={geometry}>
      <shaderMaterial
        uniforms={uniforms}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        vertexShader={GOLD_DUST_VERTEX}
        fragmentShader={GOLD_DUST_FRAGMENT}
      />
    </points>
  );
}

/**
 * Everything that rides behind the camera: the wall and searchlights in one group,
 * plus the green light and dust in world space, exactly as built before.
 */
export function Atmosphere({ store }: { store: PremiereStoreApi }) {
  const group = useRef<THREE.Group>(null);
  const camera = useThree((state) => state.camera);

  useFrame(() => {
    if (!group.current) return;
    const scene = store.getState();
    const chapter = SEQUENCE_CHAPTERS[scene.activeChapterIndex] ?? SEQUENCE_CHAPTERS[0];
    group.current.position.z = rigAnchors({
      cameraMode: scene.cameraMode,
      cameraZ: camera.position.z,
      chapterZ: chapter.zPosition,
    }).backdropZ;
  });

  return (
    <>
      <group ref={group}>
        <DecoWall />
        <Searchlights store={store} />
      </group>
      <GreenLight store={store} />
      <GoldDust store={store} />
    </>
  );
}
