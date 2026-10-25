// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_HERO_TITLE, SEQUENCE_CHAPTERS } from '../data/sequence';
import { DEFAULT_FRAME_STYLE, DEFAULT_SCREEN_BORDER_STYLE, SIGNATURE_GENOME } from '@/features/art-deco-frame';

const rigs = vi.hoisted(() => [] as {
  chapter: { id: string; archetype: string; zPosition: number; startTime: number; endTime: number };
  root: unknown;
  updateState: (state: unknown) => void;
  setFrameStyle: (style: unknown) => void;
  dispose: () => void;
}[]);

vi.mock('./decoCards', () => ({
  createGatsbyCardRig: (
    chapter: { archetype: string },
    options: { heroOverride?: { mainTitle: string } },
  ) => {
    const root = new (require('three').Group)();
    const rig = {
      chapter,
      root,
      options,
      state: null as unknown,
      updateState: vi.fn((state: unknown) => {
        rig.state = state;
      }),
      setFrameStyle: vi.fn(),
      dispose: vi.fn(),
    };
    rigs.push(rig as never);
    return rig;
  },
}));

vi.mock('./environment', () => ({
  createBallroomEnvironment: () => ({ dispose: vi.fn(), isTexture: true }),
  createDecoWallpaperTextures: () => ({
    map: { dispose: vi.fn() },
    normalMap: { dispose: vi.fn() },
    roughnessMap: { dispose: vi.fn() },
  }),
}));

const renderer = vi.hoisted(() => ({
  instance: null as null | Record<string, ReturnType<typeof vi.fn>>,
}));

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class FakeWebGLRenderer {
    domElement = document.createElement('canvas');
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
    toneMapping = 0;
    toneMappingExposure = 1;
    capabilities = { isWebGL2: true };
    shadowMap = { enabled: false };
    constructor() {
      renderer.instance = this as unknown as Record<string, ReturnType<typeof vi.fn>>;
    }
  }
  return { ...actual, WebGLRenderer: FakeWebGLRenderer };
});

vi.mock('three/examples/jsm/controls/OrbitControls.js', () => ({
  OrbitControls: class {
    enableDamping = false;
    dampingFactor = 0;
    enabled = false;
    maxDistance = 0;
    minDistance = 0;
    target = { set: vi.fn(), x: 0, y: 0, z: 0 };
    update = vi.fn();
    dispose = vi.fn();
  },
}));

vi.mock('three/examples/jsm/postprocessing/EffectComposer.js', () => ({
  EffectComposer: class {
    passes: unknown[] = [];
    addPass = vi.fn();
    render = vi.fn();
    setSize = vi.fn();
    dispose = vi.fn();
  },
}));
vi.mock('three/examples/jsm/postprocessing/RenderPass.js', () => ({ RenderPass: class {} }));
vi.mock('three/examples/jsm/postprocessing/UnrealBloomPass.js', () => ({
  UnrealBloomPass: class {
    resolution = { set: vi.fn() };
  },
}));
vi.mock('three/examples/jsm/postprocessing/ShaderPass.js', () => ({
  ShaderPass: class {
    uniforms: Record<string, { value: number }>;
    constructor(shader: { uniforms: Record<string, { value: number }> }) {
      this.uniforms = shader.uniforms;
    }
  },
}));
vi.mock('three/examples/jsm/postprocessing/OutputPass.js', () => ({ OutputPass: class {} }));

import { GatsbySceneManager } from './GatsbySceneManager';

type FrameCallback = () => void;
let frames: FrameCallback[] = [];

function runFrames(count = 1) {
  for (let i = 0; i < count; i += 1) {
    const pending = frames;
    frames = [];
    for (const frame of pending) frame();
  }
}

function createManager(callbacks: ConstructorParameters<typeof GatsbySceneManager>[1] = {}) {
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 1440, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 900, configurable: true });
  document.body.appendChild(container);
  const manager = new GatsbySceneManager(container, callbacks);
  return { manager, container };
}

beforeEach(() => {
  rigs.length = 0;
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('GatsbySceneManager', () => {
  it('mounts a WebGL canvas into the container and starts the render loop', () => {
    const { manager, container } = createManager();
    expect(container.querySelector('canvas')).not.toBeNull();
    expect(renderer.instance?.setSize).toHaveBeenCalledWith(1440, 900);
    expect(rigs).toHaveLength(SEQUENCE_CHAPTERS.length);
    manager.dispose();
  });

  it('is safe to dispose twice', () => {
    const { manager } = createManager();
    manager.dispose();
    expect(() => manager.dispose()).not.toThrow();
  });

  it('reports telemetry every frame and chapter changes once per handover', () => {
    const onTelemetry = vi.fn();
    const onChapterChange = vi.fn();
    const { manager } = createManager({ onTelemetry, onChapterChange });
    runFrames();

    expect(onChapterChange).toHaveBeenCalledWith(0);
    expect(onTelemetry).toHaveBeenCalledWith({
      currentTime: expect.any(Number),
      activeChapterIndex: 0,
      isPlaying: true,
    });

    manager.setTime(SEQUENCE_CHAPTERS[2].startTime + 1);
    runFrames();
    expect(onChapterChange).toHaveBeenLastCalledWith(2);
    onChapterChange.mockClear();
    runFrames();
    expect(onChapterChange).not.toHaveBeenCalled();
    manager.dispose();
  });

  it('clamps time, toggles playback, and rewinds when the sequence ends', () => {
    const { manager } = createManager();
    manager.setTime(4);
    expect(manager['currentTime']).toBe(4);
    manager.setTime(999);
    expect(manager['currentTime']).toBeCloseTo(37.999);
    manager.setTime(-5);
    expect(manager['currentTime']).toBe(0);

    expect(manager.togglePlaying()).toBe(false);
    manager.setPlaying(true);
    expect(manager['isPlaying']).toBe(true);

    manager.setTime(37.999);
    const clock = manager['clock'];
    vi.spyOn(clock, 'getDelta').mockReturnValue(0.5);
    runFrames();
    expect(manager['currentTime']).toBe(0);
    expect(manager['isPlaying']).toBe(true);
    manager.dispose();
  });

  it('jumps to a chapter inside its hold and clamps the index', () => {
    const { manager } = createManager();
    manager.jumpToChapter(2);
    expect(manager['currentTime']).toBeCloseTo(SEQUENCE_CHAPTERS[2].startTime + 0.15);
    manager.jumpToChapter(-3);
    expect(manager['currentTime']).toBeCloseTo(0.15);
    manager.jumpToChapter(99);
    expect(manager['currentTime']).toBeCloseTo(SEQUENCE_CHAPTERS[4].startTime + 0.15);
    manager.dispose();
  });

  it('switches between the cinema camera and damped orbit focus', () => {
    const { manager } = createManager();
    manager.setCameraMode('orbit');
    const controls = manager['controls'];
    expect(controls.enabled).toBe(true);
    expect(controls.update).toHaveBeenCalled();

    manager.setTime(SEQUENCE_CHAPTERS[1].startTime);
    manager.jumpToChapter(1);
    expect(manager['isPlaying']).toBe(false);
    expect(controls.target.set).toHaveBeenLastCalledWith(0, 0, SEQUENCE_CHAPTERS[1].zPosition);

    manager.setCameraMode('cinema');
    expect(controls.enabled).toBe(false);
    expect(manager['camera'].up.y).toBe(1);
    manager.dispose();
  });

  it('rebuilds only the hero card when the title changes', () => {
    const { manager } = createManager();
    const heroIndex = SEQUENCE_CHAPTERS.findIndex((chapter) => chapter.archetype === 'gatsby_hero');
    const previous = rigs[heroIndex];

    manager.updateHeroTitle({ ...DEFAULT_HERO_TITLE, mainTitle: 'CARRAWAY' });
    expect(previous.dispose).toHaveBeenCalledTimes(1);
    expect(rigs).toHaveLength(SEQUENCE_CHAPTERS.length + 1);
    expect(manager['heroConfig'].mainTitle).toBe('CARRAWAY');
    manager.dispose();
  });

  it('coalesces frame-style changes into one rebuild per animation frame', () => {
    const { manager } = createManager();
    const style = {
      intricacy: 1.4,
      formula: {
        ...DEFAULT_FRAME_STYLE.formula,
        level: 9,
        genome: SIGNATURE_GENOME,
        layers: [{ source: 'fractal' as const, enabled: true, level: 6 }],
      },
    };
    manager.setSequenceFrameStyle(style);
    manager.setSequenceFrameStyle({ ...style, intricacy: 0.4 });
    runFrames();

    expect(manager['frameStyle'].intricacy).toBe(0.4);
    expect(manager['frameStyle'].formula.level).toBe(4);
    expect(manager['frameStyle'].formula.layers?.[0]?.level).toBe(4);
    for (const rig of rigs.slice(0, SEQUENCE_CHAPTERS.length)) {
      expect(rig.setFrameStyle).toHaveBeenCalledTimes(1);
    }
    expect(manager['frameApplyHandle']).toBeNull();
    manager.dispose();
  });

  it('clamps and applies the screen border style and visibility', () => {
    const { manager } = createManager();
    const rig = manager['screenBorderRig'];
    const setStyle = vi.spyOn(rig, 'setStyle');
    const setEnabled = vi.spyOn(rig, 'setEnabled');
    manager.setScreenBorderStyle({ weight: 4, genome: SIGNATURE_GENOME });
    expect(manager['screenBorderStyle'].weight).toBe(1);
    expect(setStyle).toHaveBeenCalledWith(manager['screenBorderStyle']);

    manager.setScreenBorderEnabled(true);
    expect(setEnabled).toHaveBeenLastCalledWith(true);
    manager.dispose();
  });

  it('forces the nitrate look and follows the pointer with damping', () => {
    const { manager } = createManager();
    manager.setNitrateMode(true);
    const target = new THREE.Vector2(0.9, -0.4);
    manager['pointerTarget'].copy(target);
    runFrames();

    expect(manager['nitratePass'].uniforms.uNitrate.value).toBe(0.92);
    expect(manager['pointerSmooth'].x).toBeGreaterThan(0);
    expect(manager['dustUniforms'].uCamZ.value).toBe(manager['camera'].position.z);
    manager.dispose();
  });

  it('keeps the green light readable in act I and as the finale bookend', () => {
    const { manager } = createManager();
    manager.setTime(1);
    runFrames();
    const early = manager['greenLightUniforms'].uIntensity.value;
    expect(early).toBe(1);
    expect(manager['greenLightMesh'].visible).toBe(true);

    manager.setTime(20);
    runFrames();
    expect(manager['greenLightUniforms'].uIntensity.value).toBe(0);
    expect(manager['greenLightMesh'].visible).toBe(false);

    manager.setTime(36);
    runFrames();
    expect(manager['greenLightUniforms'].uIntensity.value).toBeGreaterThan(0);
    expect(manager['greenLightMesh'].position.z).toBe(SEQUENCE_CHAPTERS[4].zPosition - 7.5);
    manager.dispose();
  });

  it('hides cards outside their window and parts the gate during the fly-through', () => {
    const { manager } = createManager();
    manager.setTime(SEQUENCE_CHAPTERS[0].startTime + (SEQUENCE_CHAPTERS[0].endTime - SEQUENCE_CHAPTERS[0].startTime) * 0.9);
    runFrames();
    const gate = rigs[0] as unknown as { state: { partOpen: number } };
    const earlier = rigs[4] as unknown as { state: { opacity: number } };
    expect(gate.state).toMatchObject({ partOpen: expect.any(Number) });
    expect(gate.state.partOpen).toBeGreaterThan(0);
    expect(earlier.state.opacity).toBe(0);
    manager.dispose();
  });

  it('reframes on resize and pointer movement', () => {
    const { manager, container } = createManager();
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 1200, configurable: true });
    window.dispatchEvent(new Event('resize'));

    expect(manager['composer'].setSize).toHaveBeenCalledWith(800, 1200);
    expect(manager['nitratePass'].uniforms.uAspect.value).toBeCloseTo(800 / 1200);
    expect(manager['viewportFit'].isMobile).toBe(false);
    expect(container.querySelectorAll('canvas')).toHaveLength(1);

    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 200 }));
    expect(manager['pointerTarget'].x).toBeCloseTo((100 / window.innerWidth) * 2 - 1);
    expect(manager['pointerTarget'].y).toBeCloseTo(-((200 / window.innerHeight) * 2 - 1));
    manager.dispose();
  });

  it('uses coarse-pointer framing on touch devices', () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === '(pointer: coarse)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      const { manager } = createManager();
      expect(manager['hasCoarsePointer']).toBe(true);
      manager.dispose();
    } finally {
      window.matchMedia = original;
    }
  });

  it('disposes listeners, geometry and the canvas', () => {
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const { manager, container } = createManager();
    runFrames();
    const rig = manager['cardRigs'][0];

    manager.dispose();
    expect(removeListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(rig.dispose).toHaveBeenCalled();
    expect(manager['composer'].dispose).toHaveBeenCalled();
    expect(manager['renderer'].dispose).toHaveBeenCalled();
    expect(container.querySelector('canvas')).toBeNull();
    expect(manager['rafId']).toBeNull();
  });

  it('tolerates a disposed canvas that is no longer in the container', () => {
    const { manager, container } = createManager();
    container.innerHTML = '';
    expect(() => manager.dispose()).not.toThrow();
  });

  it('cancels a pending frame rebuild on dispose', () => {
    const { manager } = createManager();
    manager.setSequenceFrameStyle({
      intricacy: 0.5,
      formula: { ...DEFAULT_FRAME_STYLE.formula, genome: SIGNATURE_GENOME },
    });
    expect(manager['frameApplyHandle']).not.toBeNull();
    manager.dispose();
    expect(manager['frameApplyHandle']).toBeNull();
  });
});

describe('GatsbySceneManager edge branches', () => {
  it('rebuilds every card and disposes the rigs it replaces', () => {
    const { manager } = createManager();
    const previous = [...rigs];
    (manager as unknown as { buildAllCards: () => void }).buildAllCards();
    for (const rig of previous) expect(rig.dispose).toHaveBeenCalledTimes(1);
    expect(rigs).toHaveLength(SEQUENCE_CHAPTERS.length * 2);
    manager.dispose();
  });

  it('ignores a hero title change when the hero rig is gone', () => {
    const { manager } = createManager();
    const heroIdx = SEQUENCE_CHAPTERS.findIndex((c) => c.archetype === 'gatsby_hero');
    const cardRigs = (manager as unknown as { cardRigs: unknown[] }).cardRigs;
    const savedHero = cardRigs[heroIdx];
    cardRigs[heroIdx] = undefined;
    manager.updateHeroTitle({ ...DEFAULT_HERO_TITLE, mainTitle: 'OCCUPY' });
    expect(rigs).toHaveLength(SEQUENCE_CHAPTERS.length);
    cardRigs[heroIdx] = savedHero;
    manager.dispose();
  });

  it('accepts a frame style without layered formulas', () => {
    const { manager } = createManager();
    manager.setSequenceFrameStyle({
      ...DEFAULT_FRAME_STYLE,
      formula: {
        source: DEFAULT_FRAME_STYLE.formula.source,
        level: DEFAULT_FRAME_STYLE.formula.level,
        genome: DEFAULT_SCREEN_BORDER_STYLE.genome,
      },
    } as never);
    runFrames();
    expect(rigs[0].setFrameStyle).toHaveBeenCalled();
    manager.dispose();
  });

  it('leaves the playhead alone when the orbit focus already sits in the hold', () => {
    const { manager } = createManager();
    const chapter = SEQUENCE_CHAPTERS[2];
    manager.setTime(chapter.startTime + (chapter.endTime - chapter.startTime) * 0.56);
    manager.setCameraMode('orbit');
    expect(manager['currentTime']).toBeCloseTo(chapter.startTime + (chapter.endTime - chapter.startTime) * 0.56);
    manager.dispose();
  });

  it('falls back to the final chapter for a playhead outside the sequence', () => {
    const { manager } = createManager();
    manager.setTime(Number.NaN);
    manager.setCameraMode('orbit');
    const last = SEQUENCE_CHAPTERS[SEQUENCE_CHAPTERS.length - 1];
    expect(manager['controls'].target.set).toHaveBeenCalledWith(0, 0, last.zPosition);
    expect(Number.isNaN(manager['currentTime'])).toBe(true);
    manager.dispose();
  });

  it('renders paused and orbit frames without advancing the playhead', () => {
    const { manager } = createManager();
    manager.setPlaying(false);
    manager.setTime(3);
    runFrames(2);
    expect(manager['currentTime']).toBe(3);

    manager.setCameraMode('orbit');
    const controls = manager['controls'] as unknown as { update: { mockClear: () => void; mock: { calls: unknown[] } } };
    controls.update.mockClear();
    runFrames();
    expect(controls.update).toHaveBeenCalled();
    manager.dispose();
  });

  it('pulls back further when flying into the finale card', () => {
    const { manager } = createManager();
    const penultimate = SEQUENCE_CHAPTERS[SEQUENCE_CHAPTERS.length - 2];
    manager.setPlaying(false);
    manager.setTime(penultimate.endTime - 0.05);
    runFrames();
    expect(manager['getActiveChapterIndex'](manager['currentTime'])).toBe(SEQUENCE_CHAPTERS.length - 2);
    expect(Number.isFinite(manager['camera'].position.z)).toBe(true);
    manager.dispose();
  });

  it('holds one frozen frame and ignores the pointer', () => {
    const { manager } = createManager({ freezeAt: 4.32 });
    expect(manager['currentTime']).toBe(4.32);
    expect(manager['isPlaying']).toBe(false);

    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 300 }));
    expect(manager['pointerTarget'].x).toBe(0);
    expect(manager['pointerTarget'].y).toBe(0);

    // The constructor renders the first frame; the freeze holds the playhead regardless.
    runFrames(2);
    expect(manager['currentTime']).toBe(4.32);
    manager.dispose();
  });

  it('flags the container ready on the third frame', () => {
    const { manager, container } = createManager();
    // The constructor renders frame one; the flag waits for the third.
    expect(container.dataset.frameReady).toBeUndefined();
    runFrames(1);
    expect(container.dataset.frameReady).toBeUndefined();
    runFrames(1);
    expect(container.dataset.frameReady).toBe('true');
    manager.dispose();
  });

  it('can be disposed twice without cancelling a stale frame', () => {
    const { manager } = createManager();
    manager.dispose();
    expect(() => manager.dispose()).not.toThrow();
  });
});
