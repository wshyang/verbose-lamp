// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

/**
 * Characterisation of `GatsbySceneManager` (ADDENDUM-028). jsdom has no WebGL, so the
 * GPU-facing pieces are doubled at their module seams (renderer, post-processing,
 * controls, card builders, procedural textures). Everything the class itself decides, the
 * per-frame staging, camera, rig and uniform writes, runs for real. The trace golden was
 * recorded against the manager *before* its maths moved into `choreography.ts`, so a
 * refactor that changes any value fails here.
 */
const gl = vi.hoisted(() => ({
  composers: [] as Array<{ renders: number; disposed: number }>,
  shaderPasses: [] as Array<Record<string, { value: unknown }>>,
  controls: [] as Array<{
    enabled: boolean;
    disposed: number;
    updates: number;
    target: THREE.Vector3;
  }>,
  rigs: [] as Array<{
    chapter: { archetype: string; zPosition: number };
    options: { heroOverride?: { mainTitle?: string } };
    root: THREE.Group;
    setFrameStyle: ReturnType<typeof vi.fn>;
    updateState: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }>,
  rendererDisposed: 0,
}));

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class FakeWebGLRenderer {
    domElement = document.createElement('canvas');
    toneMapping = 0;
    toneMappingExposure = 1;
    setPixelRatio() {}
    setSize() {}
    dispose() {
      gl.rendererDisposed += 1;
    }
  }
  return { ...actual, WebGLRenderer: FakeWebGLRenderer };
});

vi.mock('three/examples/jsm/controls/OrbitControls.js', () => ({
  OrbitControls: class {
    target = new THREE.Vector3();
    enabled = true;
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
    record = { renders: 0, disposed: 0 };
    constructor() {
      gl.composers.push(this.record);
    }
    addPass() {}
    setSize() {}
    render() {
      this.record.renders += 1;
    }
    dispose() {
      this.record.disposed += 1;
    }
  },
}));
vi.mock('three/examples/jsm/postprocessing/RenderPass.js', () => ({ RenderPass: class {} }));
vi.mock('three/examples/jsm/postprocessing/OutputPass.js', () => ({ OutputPass: class {} }));
vi.mock('three/examples/jsm/postprocessing/UnrealBloomPass.js', () => ({
  UnrealBloomPass: class {
    resolution = new THREE.Vector2();
  },
}));
vi.mock('three/examples/jsm/postprocessing/ShaderPass.js', () => ({
  ShaderPass: class {
    uniforms: Record<string, { value: unknown }>;
    constructor(shader: { uniforms: Record<string, { value: unknown }> }) {
      this.uniforms = Object.fromEntries(
        Object.entries(shader.uniforms).map(([key, uniform]) => [key, { ...uniform }]),
      );
      gl.shaderPasses.push(this.uniforms);
    }
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
      (
        chapter: { archetype: string; zPosition: number },
        options: { heroOverride?: { mainTitle?: string } },
      ) => {
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
      },
    ),
  };
});

import { DEFAULT_SCREEN_BORDER_STYLE, DEFAULT_FRAME_STYLE } from '@/features/art-deco-frame';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { GatsbySceneManager } from './GatsbySceneManager';

type Frame = { id: number; callback: FrameRequestCallback };
const frames: Frame[] = [];
let nextFrameId = 1;

beforeEach(() => {
  vi.clearAllMocks();
  gl.composers.length = 0;
  gl.shaderPasses.length = 0;
  gl.controls.length = 0;
  gl.rigs.length = 0;
  gl.rendererDisposed = 0;
  frames.length = 0;
  nextFrameId = 1;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextFrameId++;
    frames.push({ id, callback });
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    const index = frames.findIndex((frame) => frame.id === id);
    if (index !== -1) frames.splice(index, 1);
  });
  // A fixed 50 ms tick keeps every timeline assertion deterministic.
  vi.spyOn(THREE.Clock.prototype, 'getDelta').mockImplementation(function (this: THREE.Clock) {
    this.elapsedTime += 0.05;
    return 0.05;
  });
});

function build(callbacks: ConstructorParameters<typeof GatsbySceneManager>[1] = {}) {
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 1200, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 800, configurable: true });
  document.body.appendChild(container);
  const manager = new GatsbySceneManager(container, callbacks);
  return { container, manager };
}

/** Runs the first queued frame; the animation loop queues exactly one successor. */
function step() {
  const next = frames.shift();
  expect(next).toBeDefined();
  next!.callback(0);
}

interface Inside {
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  backdropGroup: THREE.Group;
  greenLightMesh: THREE.Mesh;
  searchLightL: THREE.Mesh;
  searchLightR: THREE.Mesh;
  rigLightKey: THREE.PointLight;
  rigLightRim: THREE.PointLight;
  rigLightCool: THREE.PointLight;
}
const inside = (manager: GatsbySceneManager) => manager as unknown as Inside;
const round = (value: number) => Number(value.toFixed(6));

/** Everything one frame writes, rounded so the golden is stable across hosts. */
function traceAt(t: number, options: { forcedNitrate?: boolean } = {}) {
  const { manager } = build();
  manager.setPlaying(false);
  if (options.forcedNitrate) manager.setNitrateMode(true);
  manager.setTime(t);
  const firstRig = gl.rigs.length - SEQUENCE_CHAPTERS.length;
  step();
  const parts = inside(manager);
  const cardStates = gl.rigs.slice(firstRig).map((rig) => {
    const state = rig.updateState.mock.calls.at(-1)![0] as Record<string, number>;
    return Object.fromEntries(Object.entries(state).map(([key, value]) => [key, round(value)]));
  });
  return {
    t,
    cardStates,
    camera: [parts.camera.position.x, parts.camera.position.y, parts.camera.position.z].map(round),
    backdropZ: round(parts.backdropGroup.position.z),
    sway: [parts.searchLightL.rotation.z, parts.searchLightR.rotation.z].map(round),
    lights: [parts.rigLightKey, parts.rigLightRim, parts.rigLightCool].map((light) =>
      light.position.toArray().map(round),
    ),
    green: {
      visible: parts.greenLightMesh.visible,
      z: round(parts.greenLightMesh.position.z),
    },
    nitrate: round(gl.shaderPasses.at(-1)!.uNitrate.value as number),
    shaderTime: round(gl.shaderPasses.at(-1)!.uTime.value as number),
  };
}

describe('GatsbySceneManager frame trace (recorded before the maths was extracted)', () => {
  const TIMES = [0.2, 3, 6.5, 7.1, 10, 13.5, 20, 25, 27.6, 33, 37.9];

  it.each(TIMES)('stages the same frame at t=%d s', (t) => {
    expect(traceAt(t)).toMatchSnapshot();
  });

  it('forces the 1920s look regardless of time when the toggle is on', () => {
    expect(traceAt(20, { forcedNitrate: true })).toMatchSnapshot();
  });
});

describe('GatsbySceneManager playback', () => {
  it('advances 50 ms per frame while playing and reports telemetry', () => {
    const onTelemetry = vi.fn();
    build({ onTelemetry });
    step();

    const last = onTelemetry.mock.calls.at(-1)![0];
    expect(last.currentTime).toBeCloseTo(0.1, 6);
    expect(last.activeChapterIndex).toBe(0);
    expect(last.isPlaying).toBe(true);
  });

  it('wraps to the very start at the end of the sequence', () => {
    const onTelemetry = vi.fn();
    const { manager } = build({ onTelemetry });

    manager.setTime(37.99);
    step();

    expect(onTelemetry.mock.calls.at(-1)![0].currentTime).toBe(0);
  });

  it('announces the active chapter as it changes', () => {
    const onChapterChange = vi.fn();
    const { manager } = build({ onChapterChange });
    manager.setPlaying(false);

    manager.setTime(SEQUENCE_CHAPTERS[2].startTime + 0.2);
    step();
    manager.setTime(SEQUENCE_CHAPTERS[0].startTime + 0.2);
    step();

    expect(onChapterChange.mock.calls.map((call) => call[0])).toEqual([0, 2, 0]);
  });

  it('clamps seeks to the sequence bounds', () => {
    const onTelemetry = vi.fn();
    const { manager } = build({ onTelemetry });
    manager.setPlaying(false);

    manager.setTime(-10);
    step();
    expect(onTelemetry.mock.calls.at(-1)![0].currentTime).toBe(0);

    manager.setTime(999);
    step();
    expect(onTelemetry.mock.calls.at(-1)![0].currentTime).toBeCloseTo(37.999, 6);
  });

  it('toggles playback and reports the state it applied', () => {
    const { manager } = build();

    expect(manager.togglePlaying()).toBe(false);
    expect(manager.togglePlaying()).toBe(true);
  });
});

describe('GatsbySceneManager camera modes', () => {
  it('focuses the orbit camera on the active chapter and enables the controls', () => {
    const { manager } = build();
    manager.setPlaying(false);
    manager.setTime(SEQUENCE_CHAPTERS[1].startTime + 0.2);

    manager.setCameraMode('orbit');

    expect(gl.controls[0].enabled).toBe(true);
    expect(gl.controls[0].target.z).toBe(SEQUENCE_CHAPTERS[1].zPosition);
    expect(inside(manager).camera.position.x).toBe(2.4);
    expect(inside(manager).camera.position.z).toBeCloseTo(SEQUENCE_CHAPTERS[1].zPosition + 9.2, 9);
  });

  it('advances the clock into the hold when orbiting from the top of a card', () => {
    const onTelemetry = vi.fn();
    const { manager } = build({ onTelemetry });
    manager.setPlaying(false);
    manager.setTime(SEQUENCE_CHAPTERS[1].startTime + 0.2);

    manager.setCameraMode('orbit');
    step();

    const chapter = SEQUENCE_CHAPTERS[1];
    const expected = chapter.startTime + (chapter.endTime - chapter.startTime) * 0.56;
    expect(onTelemetry.mock.calls.at(-1)![0].currentTime).toBeCloseTo(expected, 9);
    expect(onTelemetry.mock.calls.at(-1)![0].isPlaying).toBe(false);
  });

  it('leaves the clock alone when orbiting from inside the hold', () => {
    const onTelemetry = vi.fn();
    const { manager } = build({ onTelemetry });
    manager.setPlaying(false);
    const chapter = SEQUENCE_CHAPTERS[2];
    const inHold = chapter.startTime + (chapter.endTime - chapter.startTime) * 0.6;
    manager.setTime(inHold);

    manager.setCameraMode('orbit');
    step();

    expect(onTelemetry.mock.calls.at(-1)![0].currentTime).toBeCloseTo(inHold, 9);
  });

  it('returns to cinema mode with the controls dormant and the camera upright', () => {
    const { manager } = build();
    inside(manager).camera.up.set(0.4, 0, 0);

    manager.setCameraMode('orbit');
    manager.setCameraMode('cinema');

    expect(gl.controls[0].enabled).toBe(false);
    expect(inside(manager).camera.up.toArray()).toEqual([0, 1, 0]);
  });

  it('jumps to a chapter just inside its card, clamping the index', () => {
    const onTelemetry = vi.fn();
    const { manager } = build({ onTelemetry });
    manager.setPlaying(false);

    manager.jumpToChapter(2);
    step();
    expect(onTelemetry.mock.calls.at(-1)![0].currentTime).toBeCloseTo(
      SEQUENCE_CHAPTERS[2].startTime + 0.15,
      9,
    );

    manager.jumpToChapter(-5);
    step();
    expect(onTelemetry.mock.calls.at(-1)![0].currentTime).toBeCloseTo(0.15, 9);

    manager.jumpToChapter(99);
    step();
    expect(onTelemetry.mock.calls.at(-1)![0].currentTime).toBeCloseTo(
      SEQUENCE_CHAPTERS[4].startTime + 0.15,
      9,
    );
  });
});

describe('GatsbySceneManager live style updates', () => {
  it('rebuilds only the hero card when the title changes', () => {
    const { manager } = build();
    const before = gl.rigs.length;

    manager.updateHeroTitle({
      keystone: 'THE',
      preTitle: 'GREAT',
      mainTitle: 'JAZZ',
      subCredit: 'X',
      pinstripeAlternation: false,
    });

    expect(gl.rigs).toHaveLength(before + 1);
    expect(gl.rigs[4].dispose).toHaveBeenCalledTimes(1);
    expect(gl.rigs.at(-1)!.options.heroOverride?.mainTitle).toBe('JAZZ');
    for (const rig of gl.rigs.slice(0, 4)) expect(rig.dispose).not.toHaveBeenCalled();
  });

  it('coalesces frame style changes into one rebuild per animation frame', () => {
    const { manager } = build();
    const style = { ...DEFAULT_FRAME_STYLE, intricacy: 0.9 };

    manager.setSequenceFrameStyle(style);
    manager.setSequenceFrameStyle({ ...style, intricacy: 0.2 });
    step();
    step();

    for (const rig of gl.rigs) expect(rig.setFrameStyle).toHaveBeenCalledTimes(1);
    expect(gl.rigs[0].setFrameStyle.mock.calls[0][0].intricacy).toBe(0.2);
  });

  it('clamps an out-of-range frame style before it reaches the rigs', () => {
    const { manager } = build();

    manager.setSequenceFrameStyle({
      ...DEFAULT_FRAME_STYLE,
      intricacy: 7,
      formula: { ...DEFAULT_FRAME_STYLE.formula, level: 99 },
    });
    step();
    step();

    const applied = gl.rigs[0].setFrameStyle.mock.calls.at(-1)![0];
    expect(applied.intricacy).toBe(1);
    expect(applied.formula.level).toBe(4);
  });

  it('accepts a screen border style and toggles the border', () => {
    const { manager } = build();

    expect(() => {
      manager.setScreenBorderStyle({ ...DEFAULT_SCREEN_BORDER_STYLE, weight: 5 });
      manager.setScreenBorderEnabled(true);
      manager.setScreenBorderEnabled(false);
    }).not.toThrow();
  });
});

describe('GatsbySceneManager lifecycle', () => {
  it('builds one card rig per chapter and a nitrate pass matching the aspect', () => {
    build();

    expect(gl.rigs).toHaveLength(SEQUENCE_CHAPTERS.length);
    expect(gl.shaderPasses[0].uAspect.value).toBe(1200 / 800);
    expect(Object.keys(gl.shaderPasses[0]).sort()).toEqual(['tDiffuse', 'uAspect', 'uNitrate', 'uTime']);
  });

  it('keeps orbit controls dormant in cinema mode', () => {
    build();

    expect(gl.controls[0].enabled).toBe(false);
  });

  it('renders its first frame at construction', () => {
    build();

    expect(gl.composers[0].renders).toBe(1);
  });

  it('tears down every subsystem and detaches the canvas on dispose', () => {
    const { manager, container } = build();

    manager.dispose();

    for (const rig of gl.rigs) expect(rig.dispose).toHaveBeenCalledTimes(1);
    expect(gl.controls[0].disposed).toBe(1);
    expect(gl.composers[0].disposed).toBe(1);
    expect(gl.rendererDisposed).toBe(1);
    expect(frames).toHaveLength(0);
    expect(container.querySelector('canvas')).toBeNull();
  });
});
