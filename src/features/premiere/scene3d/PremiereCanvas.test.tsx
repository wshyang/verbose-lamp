// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import * as THREE from 'three';
import { applyRendererLook, PremiereCanvas } from './PremiereCanvas';
import { createPremiereStore } from './premiereStore';

interface CanvasProps {
  dpr: [number, number];
  gl: Record<string, unknown>;
  camera: Record<string, unknown>;
  onCreated: (state: unknown) => void;
  children: ReactNode;
}

const canvas = vi.hoisted(() => ({ props: [] as CanvasProps[] }));
const scene = vi.hoisted(() => ({ props: [] as Array<{ hasCoarsePointer?: boolean }> }));

vi.mock('@react-three/fiber', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@react-three/fiber')>();
  return {
    ...actual,
    Canvas: (props: CanvasProps) => {
      canvas.props.push(props);
      return <div data-testid="canvas-stub">{props.children}</div>;
    },
  };
});

vi.mock('./PremiereScene', () => ({
  PremiereScene: (props: { hasCoarsePointer?: boolean }) => {
    scene.props.push(props);
    return null;
  },
}));
vi.mock('./BallroomEnvironment', () => ({ BallroomEnvironment: () => null }));
vi.mock('./CinemaComposer', () => ({ CinemaComposer: () => null }));

beforeEach(() => {
  canvas.props.length = 0;
  scene.props.length = 0;
});

describe('PremiereCanvas', () => {
  it('opens the canvas with the same renderer settings as the old scene', () => {
    const store = createPremiereStore();
    render(<PremiereCanvas store={store} />);

    const props = canvas.props[0];
    expect(props.dpr).toEqual([1, 2]);
    expect(props.gl).toEqual({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    expect(props.camera).toEqual({
      fov: 42,
      near: 0.1,
      far: 180,
      position: [0, 0, 10.5],
    });
    expect(props.onCreated).toBe(applyRendererLook);
    expect(scene.props[0].hasCoarsePointer).toBe(false);
  });

  it('passes the coarse-pointer hint through', () => {
    render(<PremiereCanvas store={createPremiereStore()} hasCoarsePointer />);
    expect(scene.props[0].hasCoarsePointer).toBe(true);
  });
});

describe('applyRendererLook', () => {
  function state() {
    // jsdom has no WebGL context, so the renderer here is the smallest object with the two
    // tone-mapping fields `applyRendererLook` writes.
    const gl = { toneMapping: THREE.NoToneMapping, toneMappingExposure: 1 };
    const threeScene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    return { gl, scene: threeScene, camera } as unknown as Parameters<typeof applyRendererLook>[0];
  }

  it('applies ACES tone mapping, fog and the camera-parented border', () => {
    const root = state();
    applyRendererLook(root);

    expect(root.gl.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(root.gl.toneMappingExposure).toBeCloseTo(1.18);
    expect((root.scene.background as THREE.Color).getHexString()).toBe('050407');
    const fog = root.scene.fog as THREE.FogExp2;
    expect(fog.isFogExp2).toBe(true);
    expect(fog.density).toBeCloseTo(0.022);
    expect(fog.color.getHexString()).toBe('050407');
    // The poster border is parented to the camera, so the camera must be in the scene.
    expect(root.scene.children).toContain(root.camera);
  });
});
