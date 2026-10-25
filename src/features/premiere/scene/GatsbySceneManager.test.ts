// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { setupDomTests } from '../../../test/dom';
import { installCanvas2d } from '../../../test/canvas2d';

/**
 * `GatsbySceneManager` owns the premiere: renderer, composer, controls and the
 * per-frame choreography. jsdom has no WebGL, so the GPU-facing pieces are
 * doubled at their module seams (renderer, post-processing, controls, the card
 * builders and the procedural textures). Everything the class actually decides
 * — timings, easing, camera placement, uniform writes, teardown — runs for real.
 */
const gl = vi.hoisted(() => ({
  renderers: [] as Array<{ pixelRatio: number; sizes: Array<[number, number]>; disposed: number }>,
  composers: [] as Array<{
    passes: unknown[];
    sizes: Array<[number, number]>;
    renders: number;
    disposed: number;
  }>,
  bloom: [] as Array<{ resolution: THREE.Vector2 }>,
  shaderPasses: [] as Array<Record<string, { value: unknown }>>,
  controls: [] as Array<{
    enabled: boolean;
    disposed: number;
    updates: number;
    target: THREE.Vector3;
    dampingFactor: number;
    maxDistance: number;
    minDistance: number;
  }>,
  rigs: [] as Array<{
    chapter: { archetype: string; zPosition: number };
    options: { heroOverride?: { mainTitle?: string } };
    root: THREE.Group;
    setFrameStyle: ReturnType<typeof vi.fn>;
    updateState: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class FakeWebGLRenderer {
    domElement = document.createElement('canvas');
    record = { pixelRatio: 1, sizes: [] as Array<[number, number]>, disposed: 0 };
    toneMapping = 0;
    toneMappingExposure = 1;

    constructor() {
      gl.renderers.push(this.record);
    }

    setPixelRatio(ratio: number) {
      this.record.pixelRatio = ratio;
    }

    setSize(width: number, height: number) {
      this.record.sizes.push([width, height]);
    }

    dispose() {
      this.record.disposed += 1;
    }
  }
  return { ...actual, WebGLRenderer: FakeWebGLRenderer };
});

vi.mock('three/examples/jsm/controls/OrbitControls.js', () => ({
  OrbitControls: class {
    target = new THREE.Vector3();
    enabled = true;
    enableDamping = false;
    dampingFactor = 0;
    maxDistance = 0;
    minDistance = 0;
    updates = 0;
    disposed = 0;

    constructor() {
      gl.controls.push(this as never);
    }

    update() {
      this.updates += 1;
    }

    dispose() {
      this.disposed += 1;
    }
  },
}));

vi.mock('three/examples/jsm/postprocessing/EffectComposer.js', () => ({
  EffectComposer: class {
    record = { passes: [] as unknown[], sizes: [] as Array<[number, number]>, renders: 0, disposed: 0 };

    constructor() {
      gl.composers.push(this.record);
    }

    addPass(pass: unknown) {
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
vi.mock('three/examples/jsm/postprocessing/UnrealBloomPass.js', () => ({
  UnrealBloomPass: class {
    kind = 'bloom';
    resolution = new THREE.Vector2();
    constructor(resolution: { x: number; y: number }) {
      this.resolution = new THREE.Vector2(resolution.x, resolution.y);
      gl.bloom.push(this);
    }
  },
}));
vi.mock('three/examples/jsm/postprocessing/ShaderPass.js', () => ({
  ShaderPass: class {
    kind = 'shader';
    uniforms: Record<string, { value: unknown }>;
    constructor(shader: { uniforms: Record<string, { value: unknown }> }) {
      this.uniforms = Object.fromEntries(
        Object.entries(shader.uniforms).map(([key, uniform]) => [key, { ...uniform }])
      );
      gl.shaderPasses.push(this.uniforms);
    }
  },
}));
vi.mock('three/examples/jsm/postprocessing/OutputPass.js', () => ({
  OutputPass: class {
    kind = 'output';
  },
}));

vi.mock('./environment', async () => {
  const actual = await import('three');
  const texture = () => new actual.Texture();
  return {
    createBallroomEnvironment: vi.fn(texture),
    createDecoWallpaperTextures: vi.fn(() => ({
      map: texture(),
      normalMap: texture(),
      roughnessMap: texture(),
    })),
  };
});

vi.mock('./decoCards', async () => {
  const actual = await import('three');
  return {
    createGatsbyCardRig: vi.fn(
      (chapter: { archetype: string; zPosition: number }, options: { heroOverride?: { mainTitle?: string } }) => {
        const rig = {
          chapter,
          options,
          root: new actual.Group(),
          setFrameStyle: vi.fn(),
          updateState: vi.fn(),
          dispose: vi.fn(),
        };
        gl.rigs.push(rig);
        return rig;
      }
    ),
  };
});

import * as environment from './environment';
import { SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { GatsbySceneManager, type GatsbySceneManagerOptions } from './GatsbySceneManager';

setupDomTests();

type Frame = { id: number; callback: FrameRequestCallback };
const frames: Frame[] = [];
const cancelled: number[] = [];
let nextFrameId = 1;

beforeEach(() => {
  vi.clearAllMocks();
  gl.renderers.length = 0;
  gl.composers.length = 0;
  gl.bloom.length = 0;
  gl.shaderPasses.length = 0;
  gl.controls.length = 0;
  gl.rigs.length = 0;
  frames.length = 0;
  cancelled.length = 0;
  nextFrameId = 1;

  installCanvas2d();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextFrameId++;
    frames.push({ id, callback });
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    cancelled.push(id);
    const index = frames.findIndex((frame) => frame.id === id);
    if (index !== -1) frames.splice(index, 1);
  });

  // A fixed 50 ms tick keeps every timeline assertion deterministic.
  vi.spyOn(THREE.Clock.prototype, 'getDelta').mockImplementation(function (this: THREE.Clock) {
    this.elapsedTime += 0.05;
    return 0.05;
  });
});

function stage(width = 1200, height = 800) {
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(element, 'clientHeight', { value: height, configurable: true });
  document.body.appendChild(element);
  return element;
}

/** Runs the first queued frame; the animation loop queues exactly one successor. */
function step(framesToRun = 1) {
  for (let i = 0; i < framesToRun; i += 1) {
    const next = frames.shift();
    expect(next).toBeDefined();
    next!.callback(0);
  }
}

/** Runs everything already queued (animation frames *and* one-shot deferrals). */
function drain() {
  const batch = frames.splice(0, frames.length);
  expect(batch.length).toBeGreaterThan(0);
  for (const frame of batch) frame.callback(0);
}

function build(options: GatsbySceneManagerOptions = {}) {
  const container = stage();
  const manager = new GatsbySceneManager(container, options);
  return { container, manager };
}

describe('GatsbySceneManager construction', () => {
  it('mounts an ACES-toned renderer at the container size', () => {
    const { container } = build();

    expect(gl.renderers).toHaveLength(1);
    const [renderer] = gl.renderers;
    expect(renderer.sizes).toEqual([[1200, 800]]);
    expect(renderer.pixelRatio).toBe(Math.min(window.devicePixelRatio, 2));
    expect(container.querySelector('canvas')).toBeTruthy();
  });

  it('builds the atmospheric world behind the cards', () => {
    const { manager } = build();
    const scene = (manager as unknown as { scene: THREE.Scene }).scene;

    expect(environment.createBallroomEnvironment).toHaveBeenCalledTimes(1);
    expect(environment.createDecoWallpaperTextures).toHaveBeenCalledTimes(1);
    expect(scene).toBeInstanceOf(THREE.Scene);
    expect(scene.environment).toBeTruthy();
    expect((scene.background as THREE.Color).getHexString()).toBe('050407');
    expect((scene.fog as THREE.FogExp2).density).toBe(0.022);

    const lights = scene.children.filter((child) => child instanceof THREE.PointLight);
    expect(lights).toHaveLength(3);
    expect(scene.children.some((child) => child instanceof THREE.AmbientLight)).toBe(true);
    expect(scene.children.some((child) => child instanceof THREE.Points)).toBe(true);
  });

  it('builds one card rig per sequence chapter at the viewport scale', () => {
    const { manager } = build();
    const scene = (manager as unknown as { scene: THREE.Scene }).scene;

    expect(gl.rigs).toHaveLength(SEQUENCE_CHAPTERS.length);
    for (const rig of gl.rigs) {
      expect(scene.children).toContain(rig.root);
      expect(rig.root.scale.x).toBe(1);
    }
    // Only the hero chapter receives the live title override.
    const hero = gl.rigs.find((rig) => rig.chapter.archetype === 'gatsby_hero')!;
    expect(hero.options).toHaveProperty('heroOverride.mainTitle', 'GATSBY');
  });

  it('wires the four-pass post pipeline with a nitrate pass matching the aspect', () => {
    build();

    const [composer] = gl.composers;
    expect(composer.passes.map((pass) => (pass as { kind: string }).kind)).toEqual([
      'render',
      'bloom',
      'shader',
      'output',
    ]);
    expect(gl.bloom[0].resolution.toArray()).toEqual([1200, 800]);
    // uTime, uNitrate, uAspect, tDiffuse
    expect(Object.keys(gl.shaderPasses[0]).sort()).toEqual(['tDiffuse', 'uAspect', 'uNitrate', 'uTime']);
    expect(gl.shaderPasses[0].uAspect.value).toBe(1200 / 800);
  });

  it('keeps orbit controls available but dormant in cinema mode', () => {
    build();

    expect(gl.controls).toHaveLength(1);
    expect(gl.controls[0].enabled).toBe(false);
  });

  it('renders its first frame immediately', () => {
    build();

    expect(gl.composers[0].renders).toBe(1);
    expect(frames).toHaveLength(1);
  });
});

describe('playback', () => {
  it('advances the clock while playing and reports telemetry', () => {
    const onTelemetry = vi.fn();
    build({ onTelemetry });
    step(1);

    // The constructor renders one frame; this step is the second 50 ms tick.
    const last = onTelemetry.mock.calls.at(-1)![0];
    expect(last.currentTime).toBeCloseTo(0.1, 6);
    expect(last.activeChapterIndex).toBe(0);
    expect(last.isPlaying).toBe(true);
  });

  it('wraps to the top of the sequence at the end', () => {
    const onTelemetry = vi.fn();
    const { manager } = build({ onTelemetry });

    manager.setTime(TOTAL_SEQUENCE_DURATION - 0.01);
    step(1);

    expect(onTelemetry.mock.calls.at(-1)![0].currentTime).toBe(0);
  });

  it('announces the active chapter as it changes', () => {
    const onChapterChange = vi.fn();
    const { manager } = build({ onChapterChange });

    // The first rendered frame announces chapter 0.
    expect(onChapterChange.mock.calls.map((call) => call[0])).toEqual([0]);

    manager.setTime(SEQUENCE_CHAPTERS[2].startTime + 0.2);
    step(1);
    expect(onChapterChange).toHaveBeenLastCalledWith(2);

    manager.setTime(SEQUENCE_CHAPTERS[0].startTime + 0.2);
    step(1);
    expect(onChapterChange).toHaveBeenLastCalledWith(0);
    expect(onChapterChange.mock.calls.map((call) => call[0])).toEqual([0, 2, 0]);
  });

  it('clamps seeks to the sequence bounds', () => {
    const onTelemetry = vi.fn();
    const { manager } = build({ onTelemetry });

    manager.setPlaying(false);
    manager.setTime(-10);
    step(1);
    expect(onTelemetry.mock.calls.at(-1)![0].currentTime).toBe(0);

    manager.setTime(999);
    step(1);
    expect(onTelemetry.mock.calls.at(-1)![0].currentTime).toBeCloseTo(TOTAL_SEQUENCE_DURATION - 0.001, 6);
  });

  it('toggles and sets playback state', () => {
    const { manager } = build();

    expect(manager.togglePlaying()).toBe(false);
    expect(manager.togglePlaying()).toBe(true);
    manager.setPlaying(false);

    const onTelemetry = vi.fn();
    const second = build({ onTelemetry }).manager;
    second.setPlaying(false);
    // Two managers are alive, each with a queued frame; run them all.
    drain();
    expect(onTelemetry.mock.calls.at(-1)![0].isPlaying).toBe(false);
  });
});

describe('frozen frame mode', () => {
  it('starts paused at the requested time', () => {
    const onTelemetry = vi.fn();
    build({ freezeAt: 12.5, onTelemetry });
    step(1);

    const last = onTelemetry.mock.calls.at(-1)![0];
    expect(last.currentTime).toBe(12.5);
    expect(last.isPlaying).toBe(false);
  });

  it('flags the container once three frames are composited', () => {
    const { container } = build({ freezeAt: 12.5 });

    expect(container.dataset.frameReady).toBeUndefined();
    step(1);
    expect(container.dataset.frameReady).toBeUndefined();
    step(1);
    expect(container.dataset.frameReady).toBe('true');
  });

  it('ignores pointer parallax while frozen', () => {
    const { manager } = build({ freezeAt: 12.5 });
    const pointerTarget = (manager as unknown as { pointerTarget: THREE.Vector2 }).pointerTarget;

    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 900, clientY: 200 }));

    expect(pointerTarget.toArray()).toEqual([0, 0]);
  });
});

describe('card choreography', () => {
  it('holds the finale card closed and fades everything far off-screen', () => {
    build({ freezeAt: SEQUENCE_CHAPTERS[4].startTime + 1 });

    step(1);

    const finale = gl.rigs[4];
    const state = finale.updateState.mock.calls.at(-1)![0];
    expect(state.partOpen).toBe(0);
    expect(state.opacity).toBeGreaterThan(0.9);

    // Cards outside the -0.18..1.18 local window are switched off entirely.
    const first = gl.rigs[0].updateState.mock.calls.at(-1)![0];
    expect(first).toEqual({
      drawProgress: 0,
      textProgress: 0,
      partOpen: 0,
      opacity: 0,
      time: SEQUENCE_CHAPTERS[4].startTime + 1,
    });
  });

  it('parts the gate and fades the card out as the camera flies through', () => {
    const chapter = SEQUENCE_CHAPTERS[1];
    build({ freezeAt: chapter.startTime + (chapter.endTime - chapter.startTime) * 1.05 });

    step(1);

    const state = gl.rigs[1].updateState.mock.calls.at(-1)![0];
    expect(state.partOpen).toBe(1);
    expect(state.opacity).toBeGreaterThan(0);
    expect(state.opacity).toBeLessThan(0.3);
  });

  it('drives the camera along the corridor in cinema mode', () => {
    const chapter = SEQUENCE_CHAPTERS[1];
    const { manager } = build({ freezeAt: chapter.startTime + 0.4 });
    const camera = (manager as unknown as { camera: THREE.PerspectiveCamera }).camera;

    step(1);
    const holdZ = camera.position.z;
    expect(holdZ).toBeGreaterThan(chapter.zPosition + 9);

    manager.setTime(chapter.startTime + (chapter.endTime - chapter.startTime) * 0.9);
    step(1);
    // Fly-through pushes past the card towards the next chapter.
    expect(camera.position.z).toBeLessThan(holdZ);
  });

  it('pulls the camera back on the finale with a slow drift', () => {
    const finale = SEQUENCE_CHAPTERS[4];
    const duration = finale.endTime - finale.startTime;
    const { manager } = build({ freezeAt: finale.startTime + duration * 0.5 });
    const camera = (manager as unknown as { camera: THREE.PerspectiveCamera }).camera;

    step(1);
    const first = camera.position.z;

    manager.setTime(finale.startTime + duration * 0.6);
    step(1);
    expect(camera.position.z).toBeLessThan(first);
    expect(camera.position.z).toBeGreaterThan(finale.zPosition + 11);
  });

  it('moves the atmospheric rig with the camera', () => {
    const { manager } = build({ freezeAt: 6 });
    const scene = (manager as unknown as { scene: THREE.Scene }).scene;
    const lights = scene.children.filter((child) => child instanceof THREE.PointLight);

    step(1);

    const camera = (manager as unknown as { camera: THREE.PerspectiveCamera }).camera;
    const backdrop = (manager as unknown as { backdropGroup: THREE.Group }).backdropGroup;
    expect(backdrop.position.z).toBeCloseTo(camera.position.z - 12, 6);
    // The key light tracks just ahead of the lens.
    expect(lights[0].position.z).toBeCloseTo(camera.position.z - 6.5 + 3.2, 6);
  });

  it('hides the green light outside its two windows', () => {
    const { manager } = build({ freezeAt: 20 });
    const greenLight = (manager as unknown as { greenLightMesh: THREE.Mesh }).greenLightMesh;

    step(1);
    expect(greenLight.visible).toBe(false);
    expect(greenLight.position.z).toBe(-7.5);

    manager.setTime(5);
    step(1);
    expect(greenLight.visible).toBe(true);

    manager.setTime(36);
    step(1);
    expect(greenLight.visible).toBe(true);
    expect(greenLight.position.z).toBe(SEQUENCE_CHAPTERS[4].zPosition - 7.5);
  });

  it('fades the nitrate opening out and honours the manual override', () => {
    const { manager } = build({ freezeAt: 0.2 });
    step(1);
    expect(gl.shaderPasses[0].uNitrate.value).toBeGreaterThan(0.6);

    manager.setTime(20);
    step(1);
    expect(gl.shaderPasses[0].uNitrate.value).toBe(0);
    expect(gl.shaderPasses[0].uTime.value).toBe(0.2);

    manager.setNitrateMode(true);
    step(1);
    expect(gl.shaderPasses[0].uNitrate.value).toBe(0.92);
    // Freezing also pins the shader clock, so the grain stops with the picture.
    expect(gl.shaderPasses[0].uTime.value).toBe(0.2);
  });
});

describe('camera modes', () => {
  it('enables damping-free orbit inspection around the active chapter', () => {
    const { manager } = build({ freezeAt: 9 });
    const camera = (manager as unknown as { camera: THREE.PerspectiveCamera }).camera;

    manager.setCameraMode('orbit');

    expect(gl.controls[0].enabled).toBe(true);
    expect(gl.controls[0].target.z).toBe(SEQUENCE_CHAPTERS[1].zPosition);
    expect(camera.position.x).toBe(2.4);
    // Snapping into the hold also pauses playback.
    expect(gl.controls[0].updates).toBeGreaterThan(0);

    step(1);
    expect(gl.controls[0].updates).toBeGreaterThan(1);
  });

  it('returns to cinema mode without touching the controls target', () => {
    const { manager } = build({ freezeAt: 9 });
    const camera = (manager as unknown as { camera: THREE.PerspectiveCamera }).camera;

    camera.up.set(0.4, 0, 0);
    manager.setCameraMode('orbit');
    manager.setCameraMode('cinema');

    expect(gl.controls[0].enabled).toBe(false);
    expect(camera.up.toArray()).toEqual([0, 1, 0]);

    step(1);
    expect((manager as unknown as { backdropGroup: THREE.Group }).backdropGroup.position.z).toBeCloseTo(
      camera.position.z - 12,
      6
    );
  });

  it('jumps to a chapter and snaps the orbit target there', () => {
    const { manager } = build({ freezeAt: 0 });

    manager.setCameraMode('orbit');
    manager.jumpToChapter(2);

    expect(gl.controls[0].target.z).toBe(SEQUENCE_CHAPTERS[2].zPosition);
    // Clamped both ways.
    manager.jumpToChapter(-5);
    expect(gl.controls[0].target.z).toBe(SEQUENCE_CHAPTERS[0].zPosition);
    manager.jumpToChapter(99);
    expect(gl.controls[0].target.z).toBe(SEQUENCE_CHAPTERS[4].zPosition);
  });

  it('leaves the camera alone when jumping in cinema mode', () => {
    const { manager } = build({ freezeAt: 0 });
    const camera = (manager as unknown as { camera: THREE.PerspectiveCamera }).camera;
    camera.position.set(0, 0, 10.5);

    manager.jumpToChapter(3);

    expect(camera.position.toArray()).toEqual([0, 0, 10.5]);
  });
});

describe('live style updates', () => {
  it('rebuilds only the hero card when the title changes', () => {
    const { manager } = build();
    const scene = (manager as unknown as { scene: THREE.Scene }).scene;
    const heroIndex = SEQUENCE_CHAPTERS.findIndex((chapter) => chapter.archetype === 'gatsby_hero');
    const before = gl.rigs[heroIndex];

    manager.updateHeroTitle({
      keystone: 'THE',
      preTitle: 'GREAT',
      mainTitle: 'CARRAWAY',
      subCredit: 'A NEW TITLE',
      pinstripeAlternation: false,
    });

    expect(before.dispose).toHaveBeenCalledTimes(1);
    expect(scene.children).not.toContain(before.root);

    const after = gl.rigs.filter((rig) => rig.chapter.archetype === 'gatsby_hero').at(-1)!;
    expect(after).not.toBe(before);
    expect(after.options).toHaveProperty('heroOverride.mainTitle', 'CARRAWAY');
    expect(scene.children).toContain(after.root);
  });

  it('coalesces generated frame styles into a single rebuild per frame', () => {
    const { manager } = build();

    manager.setSequenceFrameStyle({
      intricacy: 2,
      formula: { source: 'authored', level: 9, genome: { verticals: 30 } as never, layers: [
        { source: 'lattice', enabled: true, level: 9 },
      ] },
    });
    manager.setSequenceFrameStyle({
      intricacy: 0.4,
      formula: { source: 'fractal', level: 2, genome: { verticals: 6 } as never },
    });

    // Nothing applies until the next frame.
    for (const rig of gl.rigs) expect(rig.setFrameStyle).not.toHaveBeenCalled();
    drain();

    for (const rig of gl.rigs) expect(rig.setFrameStyle).toHaveBeenCalledTimes(1);
    const applied = gl.rigs[0].setFrameStyle.mock.calls[0][0];
    expect(applied.intricacy).toBeCloseTo(0.4, 6);
    expect(applied.formula.source).toBe('fractal');
    expect(applied.formula.level).toBe(2);
    expect(applied.formula.layers).toEqual([]);

    // A later frame with no new style does not rebuild again.
    step(1);
    for (const rig of gl.rigs) expect(rig.setFrameStyle).toHaveBeenCalledTimes(1);
  });

  it('passes the filtered style straight through to the border rig', () => {
    const { manager } = build();
    const border = (manager as unknown as { screenBorderRig: { setStyle: (s: unknown) => void } })
      .screenBorderRig;
    const setStyle = vi.spyOn(border, 'setStyle');

    manager.setScreenBorderStyle({ weight: 3, genome: { verticals: 0 } as never, pattern: 'lattice', seed: 7 });

    const style = setStyle.mock.calls[0][0] as { weight: number; pattern: string; seed: number };
    expect(style.weight).toBe(1);
    // The lattice proscenium must survive the manager's own normalisation.
    expect(style.pattern).toBe('lattice');
    expect(style.seed).toBe(7);
  });

  it('toggles the screen border through the rig', () => {
    const { manager } = build();
    const rig = (manager as unknown as { screenBorderRig: { root: THREE.Group } }).screenBorderRig;

    manager.setScreenBorderEnabled(true);
    expect(rig.root.visible).toBe(true);
    manager.setScreenBorderEnabled(false);
    expect(rig.root.visible).toBe(false);
  });
});

describe('pointer parallax', () => {
  it('eases the camera towards the pointer and back to centre', () => {
    const { manager } = build();
    const pointerTarget = (manager as unknown as { pointerTarget: THREE.Vector2 }).pointerTarget;
    const pointerSmooth = (manager as unknown as { pointerSmooth: THREE.Vector2 }).pointerSmooth;

    window.dispatchEvent(new PointerEvent('pointermove', { clientX: window.innerWidth, clientY: 0 }));

    expect(pointerTarget.x).toBeCloseTo(1, 6);
    expect(pointerTarget.y).toBeCloseTo(1, 6);

    step(1);
    expect(pointerSmooth.x).toBeGreaterThan(0);
    expect(pointerSmooth.x).toBeLessThan(pointerTarget.x);

    for (let i = 0; i < 40; i += 1) step(1);
    expect(pointerSmooth.x).toBeCloseTo(1, 3);
  });
});

describe('resize', () => {
  it('re-fits every dependent system to the new viewport', () => {
    const { container, manager } = build();
    const camera = (manager as unknown as { camera: THREE.PerspectiveCamera }).camera;
    const border = (manager as unknown as { screenBorderRig: { setViewport: (a: number) => void } })
      .screenBorderRig;
    const setViewport = vi.spyOn(border, 'setViewport');

    Object.defineProperty(container, 'clientWidth', { value: 600, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 1000, configurable: true });
    window.dispatchEvent(new Event('resize'));

    expect(gl.renderers[0].sizes.at(-1)).toEqual([600, 1000]);
    expect(gl.composers[0].sizes.at(-1)).toEqual([600, 1000]);
    expect(gl.bloom[0].resolution.toArray()).toEqual([600, 1000]);
    expect(gl.shaderPasses[0].uAspect.value).toBeCloseTo(0.6, 6);
    expect(camera.aspect).toBeCloseTo(0.6, 6);
    expect(setViewport).toHaveBeenCalledWith(0.6);
  });

  it('never reports a zero-sized viewport', () => {
    const { container } = build();
    Object.defineProperty(container, 'clientWidth', { value: 0, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 0, configurable: true });

    window.dispatchEvent(new Event('resize'));

    expect(gl.renderers[0].sizes.at(-1)).toEqual([1, 1]);
  });
});

describe('dispose', () => {
  it('tears down every subsystem and detaches the canvas', () => {
    const { container, manager } = build();
    const border = (manager as unknown as { screenBorderRig: { dispose: () => void } }).screenBorderRig;
    const borderDispose = vi.spyOn(border, 'dispose');
    const envDispose = vi.spyOn(
      (manager as unknown as { envTex: THREE.Texture }).envTex,
      'dispose'
    );

    manager.dispose();

    expect(cancelled.length).toBeGreaterThan(0);
    expect(frames).toHaveLength(0);
    for (const rig of gl.rigs) expect(rig.dispose).toHaveBeenCalledTimes(1);
    expect(borderDispose).toHaveBeenCalledTimes(1);
    expect(gl.controls[0].disposed).toBe(1);
    expect(envDispose).toHaveBeenCalledTimes(1);
    expect(gl.composers[0].disposed).toBe(1);
    expect(gl.renderers[0].disposed).toBe(1);
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('stops responding to window events', () => {
    const { container, manager } = build();
    manager.dispose();

    const sizes = gl.renderers[0].sizes.length;
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 10, clientY: 10 }));

    expect(gl.renderers[0].sizes).toHaveLength(sizes);
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('is safe when the canvas was already detached', () => {
    const { container, manager } = build();
    const canvas = container.querySelector('canvas')!;
    container.removeChild(canvas);

    expect(() => manager.dispose()).not.toThrow();
  });
});
