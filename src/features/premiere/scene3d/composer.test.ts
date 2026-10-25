import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const passes = vi.hoisted(() => ({
  added: [] as unknown[],
  render: vi.fn(),
  setSize: vi.fn(),
  dispose: vi.fn(),
  bloomResolution: { set: vi.fn() },
  bloomArgs: [] as number[],
}));

vi.mock('three/examples/jsm/postprocessing/EffectComposer.js', () => ({
  EffectComposer: class {
    constructor() {
      passes.added = [];
    }
    addPass = (pass: unknown) => {
      passes.added.push(pass);
    };
    render = passes.render;
    setSize = passes.setSize;
    dispose = passes.dispose;
  },
}));

vi.mock('three/examples/jsm/postprocessing/RenderPass.js', () => ({
  RenderPass: class {
    readonly kind = 'render';
    constructor(
      readonly scene: unknown,
      readonly camera: unknown,
    ) {}
  },
}));

vi.mock('three/examples/jsm/postprocessing/UnrealBloomPass.js', () => ({
  UnrealBloomPass: class {
    readonly kind = 'bloom';
    resolution = passes.bloomResolution;
    constructor(
      readonly size: THREE.Vector2,
      readonly strength: number,
      readonly radius: number,
      readonly threshold: number,
    ) {
      passes.bloomArgs = [strength, radius, threshold];
    }
  },
}));

vi.mock('three/examples/jsm/postprocessing/ShaderPass.js', () => ({
  ShaderPass: class {
    readonly kind = 'shader';
    uniforms: Record<string, { value: number }>;
    constructor(shader: { uniforms: Record<string, { value: number }> }) {
      this.uniforms = shader.uniforms;
    }
  },
}));

vi.mock('three/examples/jsm/postprocessing/OutputPass.js', () => ({
  OutputPass: class {
    readonly kind = 'output';
  },
}));

import {
  BLOOM_RADIUS,
  BLOOM_STRENGTH,
  BLOOM_THRESHOLD,
  createCinemaComposer,
} from './composer';

function build(width = 1440, height = 900) {
  const gl = {} as THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const pipeline = createCinemaComposer(gl, scene, camera, width, height);
  const [render, bloom, nitrate, output] = passes.added as Array<{
    kind: string;
    scene?: unknown;
    camera?: unknown;
    size?: THREE.Vector2;
    uniforms?: Record<string, { value: number }>;
  }>;
  return { pipeline, render, bloom, nitrate, output, gl };
}

describe('createCinemaComposer', () => {
  it('chains render → bloom → nitrate → output in that order', () => {
    const { render, bloom, nitrate, output } = build();
    expect([render.kind, bloom.kind, nitrate.kind, output.kind]).toEqual([
      'render',
      'bloom',
      'shader',
      'output',
    ]);
    expect(bloom.size).toEqual(new THREE.Vector2(1440, 900));
    expect(passes.bloomArgs).toEqual([BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD]);
    expect(passes.bloomArgs).toEqual([0.56, 0.64, 0.78]);
    expect(nitrate.uniforms?.uAspect.value).toBeCloseTo(1440 / 900);
    expect(nitrate.uniforms?.uNitrate.value).toBe(0);
  });

  it('renders through the composer', () => {
    const { pipeline } = build();
    pipeline.render();
    expect(passes.render).toHaveBeenCalledTimes(1);
  });

  it('resizes every pass that cares about the viewport', () => {
    const { pipeline, nitrate } = build();
    pipeline.setSize(390, 844);
    expect(passes.setSize).toHaveBeenCalledWith(390, 844);
    expect(passes.bloomResolution.set).toHaveBeenCalledWith(390, 844);
    expect(nitrate.uniforms?.uAspect.value).toBeCloseTo(390 / 844);
  });

  it('resizes without dividing by a zero height', () => {
    const { pipeline, nitrate } = build(0, 0);
    pipeline.setSize(100, 0);
    expect(nitrate.uniforms?.uAspect.value).toBe(100);
  });

  it('drives the nitrate uniforms and disposes', () => {
    const { pipeline, nitrate } = build();
    pipeline.setNitrate(12.5, 0.92);
    expect(nitrate.uniforms?.uTime.value).toBe(12.5);
    expect(nitrate.uniforms?.uNitrate.value).toBe(0.92);

    pipeline.dispose();
    expect(passes.dispose).toHaveBeenCalledTimes(1);
  });
});
