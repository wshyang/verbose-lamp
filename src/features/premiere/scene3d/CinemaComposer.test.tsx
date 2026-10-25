// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { FORCED_NITRATE, openingNitrate } from '../scene/choreography';
import { createPremiereStore } from './premiereStore';
import { BLOOM, CinemaComposer } from './CinemaComposer';

/**
 * The composer without a GPU (ADDENDUM-022 §7). The four `three` passes are replaced by
 * recorders, so the test can read the pass order, the bloom settings and the uniform the
 * `useFrame` writes — which is the whole contract: one render path, in the manager's order.
 */
const post = vi.hoisted(() => ({
  composers: [] as Array<{
    passes: unknown[];
    sizes: Array<[number, number]>;
    renders: number;
    disposed: boolean;
  }>,
}));

vi.mock('three/examples/jsm/postprocessing/EffectComposer.js', () => ({
  EffectComposer: class {
    passes: unknown[] = [];
    sizes: Array<[number, number]> = [];
    renders = 0;
    disposed = false;
    addPass(pass: unknown) {
      this.passes.push(pass);
    }
    setSize(width: number, height: number) {
      this.sizes.push([width, height]);
    }
    render() {
      this.renders += 1;
    }
    dispose() {
      this.disposed = true;
    }
    constructor() {
      post.composers.push(this);
    }
  },
}));

vi.mock('three/examples/jsm/postprocessing/RenderPass.js', () => ({
  RenderPass: class {
    kind = 'render';
    constructor(public scene: unknown, public camera: unknown) {}
  },
}));

vi.mock('three/examples/jsm/postprocessing/UnrealBloomPass.js', () => ({
  UnrealBloomPass: class {
    kind = 'bloom';
    resolution = new THREE.Vector2();
    constructor(
      public size: THREE.Vector2,
      public strength: number,
      public radius: number,
      public threshold: number
    ) {}
  },
}));

vi.mock('three/examples/jsm/postprocessing/ShaderPass.js', () => ({
  ShaderPass: class {
    kind = 'nitrate';
    uniforms: Record<string, { value: unknown }>;
    constructor(public shader: { uniforms: Record<string, { value: unknown }> }) {
      this.uniforms = shader.uniforms;
    }
  },
}));

vi.mock('three/examples/jsm/postprocessing/OutputPass.js', () => ({
  OutputPass: class {
    kind = 'output';
  },
}));

interface Pass {
  kind?: string;
  uniforms?: Record<string, { value: unknown }>;
  resolution?: THREE.Vector2;
  strength?: number;
  radius?: number;
  threshold?: number;
}

async function mount(store = createPremiereStore()) {
  const renderer = await ReactThreeTestRenderer.create(<CinemaComposer store={store} />, {
    width: 800,
    height: 600,
  });
  const composer = post.composers[post.composers.length - 1];
  const passes = composer.passes as Pass[];
  return { renderer, composer, passes, store };
}

describe('CinemaComposer', () => {
  it('keeps the manager pass order: render, bloom, nitrate, output', async () => {
    const { passes, renderer } = await mount();

    expect(passes.map((pass) => pass.kind)).toEqual(['render', 'bloom', 'nitrate', 'output']);
    await renderer.unmount();
  });

  it('uses the premiere bloom, not a default one', async () => {
    const { passes, renderer } = await mount();
    const bloom = passes[1];

    expect([bloom.strength, bloom.radius, bloom.threshold]).toEqual([
      BLOOM.strength,
      BLOOM.radius,
      BLOOM.threshold,
    ]);
    expect(BLOOM).toEqual({ strength: 0.56, radius: 0.64, threshold: 0.78 });
    await renderer.unmount();
  });

  it('sizes the composer and the aspect uniform from the canvas', async () => {
    const { composer, passes, renderer } = await mount();
    const nitrate = passes[2];

    expect(composer.sizes).toContainEqual([800, 600]);
    expect(nitrate.uniforms?.uAspect.value).toBeCloseTo(800 / 600, 9);
    expect(passes[1].resolution?.toArray()).toEqual([800, 600]);
    await renderer.unmount();
  });

  it('drives the nitrate pass from the store on every frame', async () => {
    const { passes, store, renderer } = await mount();
    const nitrate = passes[2];

    await renderer.advanceFrames(1, 0.016);

    expect(nitrate.uniforms?.uTime.value).toBeCloseTo(store.getState().elapsed, 9);
    expect(nitrate.uniforms?.uNitrate.value).toBeCloseTo(
      openingNitrate(store.getState().currentTime),
      9
    );
    await renderer.unmount();
  });

  it('lifts the film to the forced nitrate look when the toggle is on', async () => {
    const store = createPremiereStore();
    store.getState().setNitrateMode(true);
    const { passes, renderer } = await mount(store);

    await renderer.advanceFrames(1, 0.016);

    expect(passes[2].uniforms?.uNitrate.value).toBe(FORCED_NITRATE);
    await renderer.unmount();
  });

  it('renders exactly once per frame and disposes the pipeline on unmount', async () => {
    const { composer, renderer } = await mount();

    await renderer.advanceFrames(3, 0.016);
    expect(composer.renders).toBe(3);

    await renderer.unmount();
    expect(composer.disposed).toBe(true);
  });
});
