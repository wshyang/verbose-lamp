// @vitest-environment jsdom
// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import 'vitest-canvas-mock';

import { describe, expect, it, vi } from 'vitest';

import ReactThreeTestRenderer from '@react-three/test-renderer';

import { CinemaComposer } from './CinemaComposer';

import { createPremiereStore } from './premiereStore';

const post = vi.hoisted(() => ({
  composers: [] as Array<Record<string, ReturnType<typeof vi.fn> | unknown[]>>,
  blooms: [] as Array<{ resolution: { set: ReturnType<typeof vi.fn> } }>,
  shaders: [] as Array<{ uniforms: Record<string, { value: number }> }>,
}));
vi.mock('three/examples/jsm/postprocessing/EffectComposer.js', () => ({
  EffectComposer: class {
    passes: unknown[] = [];
    addPass = vi.fn((pass: unknown) => { this.passes.push(pass); });
    setSize = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
    constructor() { post.composers.push(this as never); }
  },
}));
vi.mock('three/examples/jsm/postprocessing/UnrealBloomPass.js', () => ({
  UnrealBloomPass: class {
    resolution = { set: vi.fn() };
    constructor() { post.blooms.push(this); }
  },
}));
vi.mock('three/examples/jsm/postprocessing/ShaderPass.js', () => ({
  ShaderPass: class {
    uniforms = { uAspect: { value: 0 }, uTime: { value: 0 }, uNitrate: { value: 0 } };
    constructor() { post.shaders.push(this); }
  },
}));
vi.mock('three/examples/jsm/postprocessing/RenderPass.js', () => ({ RenderPass: class {} }));
vi.mock('three/examples/jsm/postprocessing/OutputPass.js', () => ({ OutputPass: class {} }));
describe('CinemaComposer', () => {
  it('builds four passes, sizes/aspects them, renders auto/forced nitrate, and disposes', async () => {
    const store = createPremiereStore({ freezeAt: null });
    const renderer = await ReactThreeTestRenderer.create(
      <CinemaComposer store={store} />, { width: 800, height: 400 }
    );
    const composer = post.composers[0] as unknown as {
      passes: unknown[]; setSize: ReturnType<typeof vi.fn>; render: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>;
    };
    expect(composer.passes).toHaveLength(4);
    expect(composer.setSize).toHaveBeenCalledWith(800, 400);
    expect(post.blooms[0].resolution.set).toHaveBeenCalledWith(800, 400);
    expect(post.shaders[0].uniforms.uAspect.value).toBe(2);

    await renderer.advanceFrames(1, 0);
    const auto = post.shaders[0].uniforms.uNitrate.value;
    await ReactThreeTestRenderer.act(async () => store.getState().setNitrateMode(true));
    await renderer.advanceFrames(1, 0);
    expect(composer.render).toHaveBeenCalledTimes(2);
    expect(post.shaders[0].uniforms.uNitrate.value).not.toBe(auto);
    await renderer.unmount();
    expect(composer.dispose).toHaveBeenCalledOnce();
  });
});
