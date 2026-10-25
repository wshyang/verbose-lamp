// @vitest-environment jsdom
import type { ReactNode } from 'react';
import * as THREE from 'three';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { applyRendererLook, PremiereCanvas } from './PremiereCanvas';
import { createPremiereStore } from './premiereStore';

const captured = vi.hoisted(() => ({ props: undefined as never }));

vi.mock('@react-three/fiber', () => ({
  Canvas: (props: Record<string, unknown> & { children?: ReactNode }) => {
    captured.props = props as never;
    return <section data-testid="canvas-mock">{props.children}</section>;
  },
}));
vi.mock('./PremiereScene', () => ({
  PremiereScene: () => <div data-testid="scene-mock" />,
}));

describe('PremiereCanvas', () => {
  it('configures the R3F canvas and applies the delivered renderer look', () => {
    const store = createPremiereStore({ freezeAt: null });
    render(<PremiereCanvas store={store} />);
    expect(screen.getByTestId('scene-mock')).toBeTruthy();
    const props = captured.props as unknown as Record<string, unknown>;
    expect(props).toMatchObject({
      className: 'h-full w-full', dpr: [1, 2],
      gl: { antialias: true, powerPreference: 'high-performance', alpha: false },
      camera: { fov: 42, near: 0.1, far: 180, position: [0, 0, 10.5] },
    });

    const gl = {} as THREE.WebGLRenderer;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    (props.onCreated as typeof applyRendererLook)({ gl, scene, camera } as never);
    expect(gl.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(gl.toneMappingExposure).toBe(1.18);
    expect(scene.background).toBeInstanceOf(THREE.Color);
    expect(scene.fog).toBeInstanceOf(THREE.FogExp2);
    expect(scene.children).toContain(camera);
  });
});
