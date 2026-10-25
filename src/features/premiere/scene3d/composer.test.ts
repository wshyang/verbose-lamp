import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

// three's passes need a GPU, so they are doubled at their module seams. What is under test
// is the chain: which passes, in which order, built with which numbers, and how the
// pipeline is resized, fed and torn down.
const log = vi.hoisted(() => ({
  composers: [] as Array<{
    passes: Array<{ kind: string }>;
    sizes: Array<[number, number]>;
    renders: number;
    disposed: number;
  }>,
  blooms: [] as Array<{
    resolution: { x: number; y: number };
    strength: number;
    radius: number;
    threshold: number;
  }>,
  shaders: [] as Array<Record<string, { value: unknown }>>,
}));

vi.mock('three/examples/jsm/postprocessing/EffectComposer.js', () => ({
  EffectComposer: class {
    record = {
      passes: [] as Array<{ kind: string }>,
      sizes: [] as Array<[number, number]>,
      renders: 0,
      disposed: 0,
    };
    constructor() {
      log.composers.push(this.record);
    }
    addPass(pass: { kind: string }) {
      this.record.passes.push(pass);
    }
    setSize(width: number, height: number) {
      this.record.sizes.push([width, height]);
    }
    render() {
      this.record.renders += 1;
    }
    dispose() {
      this.record.disposed += 1;
    }
  },
}));
vi.mock('three/examples/jsm/postprocessing/RenderPass.js', () => ({
  RenderPass: class {
    kind = 'render';
  },
}));
vi.mock('three/examples/jsm/postprocessing/OutputPass.js', () => ({
  OutputPass: class {
    kind = 'output';
  },
}));
vi.mock('three/examples/jsm/postprocessing/UnrealBloomPass.js', () => ({
  UnrealBloomPass: class {
    kind = 'bloom';
    resolution: THREE.Vector2;
    strength: number;
    radius: number;
    threshold: number;
    constructor(resolution: THREE.Vector2, strength: number, radius: number, threshold: number) {
      this.resolution = new THREE.Vector2(resolution.x, resolution.y);
      this.strength = strength;
      this.radius = radius;
      this.threshold = threshold;
      log.blooms.push(this);
    }
  },
}));
vi.mock('three/examples/jsm/postprocessing/ShaderPass.js', () => ({
  ShaderPass: class {
    kind = 'shader';
    uniforms: Record<string, { value: unknown }>;
    constructor(shader: { uniforms: Record<string, { value: unknown }> }) {
      this.uniforms = Object.fromEntries(
        Object.entries(shader.uniforms).map(([key, uniform]) => [key, { ...uniform }]),
      );
      log.shaders.push(this.uniforms);
    }
  },
}));

import { BLOOM_RADIUS, BLOOM_STRENGTH, BLOOM_THRESHOLD, createCinemaComposer } from './composer';

function build(width = 1200, height = 800) {
  log.composers.length = 0;
  log.blooms.length = 0;
  log.shaders.length = 0;
  const pipeline = createCinemaComposer(
    {} as THREE.WebGLRenderer,
    new THREE.Scene(),
    new THREE.PerspectiveCamera(),
    width,
    height,
  );
  return { pipeline, composer: log.composers[0], bloom: log.blooms[0], nitrate: log.shaders[0] };
}

describe('createCinemaComposer', () => {
  it('chains render, bloom, nitrate, output in that order', () => {
    const { composer } = build();

    expect(composer.passes.map((pass) => pass.kind)).toEqual(['render', 'bloom', 'shader', 'output']);
  });

  it('blooms with the shipped strength, radius and threshold at the canvas size', () => {
    const { bloom } = build(1200, 800);

    expect([bloom.strength, bloom.radius, bloom.threshold]).toEqual([0.56, 0.64, 0.78]);
    expect([BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD]).toEqual([0.56, 0.64, 0.78]);
    expect([bloom.resolution.x, bloom.resolution.y]).toEqual([1200, 800]);
  });

  it('builds the nitrate pass with the shipped uniforms and the canvas aspect', () => {
    const { nitrate } = build(1200, 800);

    expect(Object.keys(nitrate).sort()).toEqual(['tDiffuse', 'uAspect', 'uNitrate', 'uTime']);
    expect(nitrate.uAspect.value).toBe(1.5);
    expect(nitrate.uNitrate.value).toBe(0);
  });

  it('never divides by a zero-height canvas', () => {
    const { nitrate } = build(300, 0);

    expect(Number.isFinite(nitrate.uAspect.value as number)).toBe(true);
    expect(nitrate.uAspect.value).toBe(300);
  });

  it('renders through the composer', () => {
    const { pipeline, composer } = build();

    pipeline.render();
    pipeline.render();

    expect(composer.renders).toBe(2);
  });

  it('resizes the composer, the bloom resolution and the nitrate aspect together', () => {
    const { pipeline, composer, bloom, nitrate } = build(1200, 800);

    pipeline.setSize(390, 844);

    expect(composer.sizes).toEqual([[390, 844]]);
    expect([bloom.resolution.x, bloom.resolution.y]).toEqual([390, 844]);
    expect(nitrate.uAspect.value).toBeCloseTo(390 / 844, 12);
  });

  it('feeds the shader clock and the nitrate mix', () => {
    const { pipeline, nitrate } = build();

    pipeline.setNitrate(12.5, 0.92);

    expect(nitrate.uTime.value).toBe(12.5);
    expect(nitrate.uNitrate.value).toBe(0.92);
  });

  it('disposes the composer', () => {
    const { pipeline, composer } = build();

    pipeline.dispose();

    expect(composer.disposed).toBe(1);
  });
});
