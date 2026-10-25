import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import {
  DEFAULT_HERO_TITLE,
  SEQUENCE_CHAPTERS,
  TOTAL_SEQUENCE_DURATION,
} from '../data/sequence';
import type { CameraMode, HeroTitleConfig } from '../model/types';
import { createBallroomEnvironment, createDecoWallpaperTextures } from './environment';
import { createGatsbyCardRig, type GatsbyCardRig } from './decoCards';
import {
  DEFAULT_FRAME_STYLE,
  DEFAULT_SCREEN_BORDER_STYLE,
  FrameStyle,
  ScreenBorderStyle,
} from '@/features/art-deco-frame';
import { SIGNATURE_GENOME, clampGenome } from '@/features/art-deco-frame';
import { createScreenBorderRig, type ScreenBorderRig } from '@/features/art-deco-frame';
import { mulberry32 } from '@/shared/lib/random';
import type { PlaybackTelemetry, PremiereSceneApi, SceneManagerOptions } from './sceneApi';

export type { PlaybackTelemetry };
import { getCinemaCameraPose, resolveViewportFit, ViewportFit } from './responsiveLayout';
import {
  activeChapterIndex,
  cardPhase,
  cinemaCameraZ,
  greenLight,
  lightRig,
  nitrateStrength,
  rigAnchors,
  searchlightSway,
} from './choreography';

const CinemaNitrateShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uNitrate: { value: 0 }, // 0 = full golden 3D color, 1 = 1920s B&W silver-nitrate projection
    uAspect: { value: 1.77 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uNitrate;
    uniform float uAspect;
    varying vec2 vUv;

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec2 centered = vUv - 0.5;
      float r2 = dot(centered * vec2(uAspect * 0.62, 1.0), centered * vec2(uAspect * 0.62, 1.0));

      // Subtle anamorphic edge dispersion
      vec2 caOffset = centered * r2 * 0.0045;
      float r = texture2D(tDiffuse, vUv + caOffset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - caOffset).b;
      vec3 col = vec3(r, g, b);

      // 1920s Silver-Nitrate Projector Opening / Filter Mode (Baz Luhrmann homage)
      if (uNitrate > 0.001) {
        float luma = dot(col, vec3(0.299, 0.587, 0.114));
        // Subtle projector bulb flicker
        float flicker = 0.94 + 0.06 * sin(uTime * 27.0) * cos(uTime * 13.0);
        // Fine vertical emulsion scratch lines
        float scratchSeed = floor(vUv.x * 380.0 + floor(uTime * 16.0) * 19.3);
        float scratch = step(0.9965, hash12(vec2(scratchSeed, floor(uTime * 14.0)))) * 0.22;
        vec3 silverTone = vec3(luma * 1.06, luma * 1.02, luma * 0.93) * flicker + scratch;
        col = mix(col, silverTone, uNitrate);
      }

      // Ultra-fine cinema film grain to eliminate any dark shadow banding
      float grain = (hash12(vUv * 820.0 + fract(uTime * 37.0)) - 0.5) * (0.022 + uNitrate * 0.035);
      col += grain;

      // Soft theatrical vignette
      float vig = smoothstep(1.25, 0.22, r2 * 1.15);
      col *= mix(0.42, 1.0, vig);

      gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
    }
  `,
};

/** Fixed seed for the atmosphere: the dust used to be random on every load. */
const DUST_SEED = 1920;

export class GatsbySceneManager implements PremiereSceneApi {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private viewportFit: ViewportFit = resolveViewportFit(1, 1, false);
  private readonly hasCoarsePointer: boolean;
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private nitratePass: ShaderPass;
  private controls: OrbitControls;

  private envTex: THREE.Texture;
  private cardRigs: GatsbyCardRig[] = [];
  private heroConfig: HeroTitleConfig = { ...DEFAULT_HERO_TITLE };
  private frameStyle: FrameStyle = {
    intricacy: DEFAULT_FRAME_STYLE.intricacy,
    formula: { ...DEFAULT_FRAME_STYLE.formula, genome: { ...SIGNATURE_GENOME } },
  };
  private screenBorderStyle: ScreenBorderStyle = { ...DEFAULT_SCREEN_BORDER_STYLE };
  private screenBorderEnabled = false;
  private screenBorderRig: ScreenBorderRig;
  private frameApplyHandle: number | null = null;

  // Dynamic atmospheric elements
  private backdropGroup: THREE.Group;
  private greenLightMesh!: THREE.Mesh;
  private greenLightUniforms = {
    uTime: { value: 0 },
    uIntensity: { value: 1 },
  };
  private dustPoints!: THREE.Points;
  private dustUniforms = {
    uTime: { value: 0 },
    uCamZ: { value: 10 },
  };
  private searchLightL!: THREE.Mesh;
  private searchLightR!: THREE.Mesh;
  private rigLightKey: THREE.PointLight;
  private rigLightRim: THREE.PointLight;
  private rigLightCool: THREE.PointLight;

  // Timeline & interaction state
  private currentTime = 0;
  private isPlaying = true;
  private cameraMode: CameraMode = 'cinema';
  private forceNitrateMode = false;
  private pointerTarget = new THREE.Vector2(0, 0);
  private pointerSmooth = new THREE.Vector2(0, 0);

  private rafId: number | null = null;
  private clock = new THREE.Clock();
  private lastChapterIdx = -1;

  private onTelemetry?: (telemetry: PlaybackTelemetry) => void;
  private onChapterChange?: (chapterIdx: number) => void;

  /** Set only by the screenshot affordance: hold this time and never advance. */
  private readonly freezeAt: number | null;
  /** How many frames have been rendered; the third one flags the mount div ready. */
  private renderedFrames = 0;

  constructor(container: HTMLElement, options?: SceneManagerOptions) {
    const callbacks = options;
    this.container = container;
    this.hasCoarsePointer =
      window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    this.onTelemetry = callbacks?.onTelemetry;
    this.onChapterChange = callbacks?.onChapterChange;
    this.freezeAt = callbacks?.freezeAt ?? null;
    if (this.freezeAt !== null) {
      this.currentTime = this.freezeAt;
      this.isPlaying = false;
    }

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    this.viewportFit = resolveViewportFit(width, height, this.hasCoarsePointer);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#050407');
    this.scene.fog = new THREE.FogExp2('#050407', 0.022);

    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 180);
    this.camera.position.set(0, 0, 10.5);
    // Keep the camera in the scene graph so its camera-local poster border is rendered.
    this.scene.add(this.camera);
    this.screenBorderRig = createScreenBorderRig(
      this.camera,
      this.screenBorderStyle,
      width / Math.max(1, height)
    );
    this.screenBorderRig.setEnabled(this.screenBorderEnabled);

    this.envTex = createBallroomEnvironment(this.renderer);
    this.scene.environment = this.envTex;

    // OrbitControls for interactive 3D inspection mode
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enabled = false;
    this.controls.maxDistance = 26;
    this.controls.minDistance = 3.2;

    // Theatrical moving lighting rig
    const ambient = new THREE.AmbientLight('#ffe8b3', 0.35);
    this.scene.add(ambient);

    this.rigLightKey = new THREE.PointLight('#ffdf91', 28, 32, 1.5);
    this.rigLightRim = new THREE.PointLight('#f5a623', 22, 30, 1.5);
    this.rigLightCool = new THREE.PointLight('#7da9e8', 11, 28, 1.6);
    this.scene.add(this.rigLightKey, this.rigLightRim, this.rigLightCool);

    // Build atmospheric world
    this.backdropGroup = new THREE.Group();
    this.scene.add(this.backdropGroup);
    this.buildAtmosphericWorld();

    // Build all 5 choreographed 3D Title Card Rigs
    this.buildAllCards();

    // Post-processing pipeline
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.56, // controlled luxurious specular bloom
      0.64,
      0.78
    );
    this.composer.addPass(this.bloomPass);

    this.nitratePass = new ShaderPass(CinemaNitrateShader);
    this.nitratePass.uniforms.uAspect.value = width / height;
    this.composer.addPass(this.nitratePass);

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);

    // Event listeners
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('pointermove', this.handlePointerMove);

    this.clock.start();
    this.animate();
  }

  private buildAtmosphericWorld() {
    // 1. Recessed 3D Art Deco Tessellated Ballroom Wall (tracks behind active chamber)
    const wallTextures = createDecoWallpaperTextures();
    const wallGeo = new THREE.PlaneGeometry(46, 26);
    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTextures.map,
      normalMap: wallTextures.normalMap,
      normalScale: new THREE.Vector2(1.6, 1.6),
      roughnessMap: wallTextures.roughnessMap,
      metalness: 0.72,
      roughness: 0.55,
      envMapIntensity: 0.85,
    });
    const backWall = new THREE.Mesh(wallGeo, wallMat);
    backWall.position.set(0, 0, -14.5);
    this.backdropGroup.add(backWall);

    // 2. Sweeping 1920s Premiere Volumetric Searchlight Cones
    const beamCanvas = document.createElement('canvas');
    beamCanvas.width = 128;
    beamCanvas.height = 256;
    const bCtx = beamCanvas.getContext('2d')!;
    const bGrad = bCtx.createLinearGradient(0, 0, 0, 256);
    bGrad.addColorStop(0.0, 'rgba(255, 226, 148, 0.0)');
    bGrad.addColorStop(0.25, 'rgba(255, 222, 138, 0.11)');
    bGrad.addColorStop(0.85, 'rgba(212, 165, 55, 0.03)');
    bGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    bCtx.fillStyle = bGrad;
    bCtx.fillRect(0, 0, 128, 256);

    // Soft horizontal falloff
    bCtx.globalCompositeOperation = 'destination-in';
    const hGrad = bCtx.createLinearGradient(0, 0, 128, 0);
    hGrad.addColorStop(0.0, 'rgba(0,0,0,0)');
    hGrad.addColorStop(0.5, 'rgba(255,255,255,1)');
    hGrad.addColorStop(1.0, 'rgba(0,0,0,0)');
    bCtx.fillStyle = hGrad;
    bCtx.fillRect(0, 0, 128, 256);

    const beamTex = new THREE.CanvasTexture(beamCanvas);
    const beamMat = new THREE.MeshBasicMaterial({
      map: beamTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beamGeo = new THREE.PlaneGeometry(7.5, 26);

    this.searchLightL = new THREE.Mesh(beamGeo, beamMat);
    this.searchLightL.position.set(-6.5, -4, -9.5);
    this.searchLightL.rotation.z = -0.38;

    this.searchLightR = new THREE.Mesh(beamGeo, beamMat);
    this.searchLightR.position.set(6.5, -4, -9.5);
    this.searchLightR.rotation.z = 0.38;

    this.backdropGroup.add(this.searchLightL, this.searchLightR);

    // 3. The Iconic Distant Green Light Across the Dark Bay (Act I & Deep Distance)
    const greenGeo = new THREE.PlaneGeometry(14, 10);
    const greenMat = new THREE.ShaderMaterial({
      uniforms: this.greenLightUniforms,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uIntensity;
        varying vec2 vUv;
        void main() {
          vec2 p = (vUv - vec2(0.5, 0.54)) * vec2(1.4, 1.0);
          float d = length(p);

          // Pulsing lighthouse / dock emerald heartbeat
          float pulse = 0.72 + 0.28 * sin(uTime * 2.3) * (0.8 + 0.2 * sin(uTime * 6.7));
          float core = exp(-d * 28.0) * 1.9;
          float halo = exp(-d * 5.8) * 0.55;
          float flareH = exp(-abs(p.y) * 44.0) * exp(-abs(p.x) * 3.8) * 0.75;

          // Subtle shimmering bay water reflection below y = 0.50
          float below = smoothstep(0.52, 0.14, vUv.y);
          float ripple = sin(vUv.y * 140.0 - uTime * 4.5 + sin(vUv.x * 30.0) * 2.0) * 0.5 + 0.5;
          float waterRefl = below * exp(-abs(p.x) * 9.5) * ripple * 0.38;

          vec3 emerald = vec3(0.08, 0.98, 0.52);
          vec3 coreWhite = vec3(0.82, 1.0, 0.9);
          vec3 col = (emerald * (halo + flareH + waterRefl) + coreWhite * core) * pulse * uIntensity;
          gl_FragColor = vec4(col, clamp((core + halo + waterRefl) * uIntensity, 0.0, 1.0));
        }
      `,
    });
    this.greenLightMesh = new THREE.Mesh(greenGeo, greenMat);
    this.greenLightMesh.position.set(0, -0.15, -9.5);
    this.scene.add(this.greenLightMesh);

    // 4. Stereoscopic 3D Champagne Gold Dust & Diamond Confetti Field
    const count = 950;
    const random = mulberry32(DUST_SEED);
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const phases = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (random() - 0.5) * 24;
      positions[i * 3 + 1] = (random() - 0.5) * 14;
      positions[i * 3 + 2] = 12 - random() * 136; // spans entire theatrical Z corridor
      scales[i] = 0.4 + random() * 1.8;
      phases[i] = random() * Math.PI * 2;
    }

    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    dustGeo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    dustGeo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

    const dustMat = new THREE.ShaderMaterial({
      uniforms: this.dustUniforms,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float aScale;
        attribute float aPhase;
        uniform float uTime;
        uniform float uCamZ;
        varying float vTwinkle;
        varying float vDepthFade;

        void main() {
          vec3 pos = position;
          pos.y += sin(uTime * 0.45 + aPhase) * 0.35;
          pos.x += cos(uTime * 0.32 + aPhase * 1.7) * 0.28;

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          float dist = -mvPosition.z;
          vDepthFade = smoothstep(0.6, 3.2, dist) * (1.0 - smoothstep(26.0, 44.0, dist));
          vTwinkle = 0.45 + 0.55 * sin(uTime * 3.1 + aPhase * 5.0);

          gl_PointSize = clamp((34.0 * aScale) / max(1.0, dist), 1.5, 16.0);
          gl_Position = projectionMatrix * mvPosition + vec4(0.0, 0.0, uCamZ * 0.0, 0.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vTwinkle;
        varying float vDepthFade;

        void main() {
          vec2 p = gl_PointCoord - 0.5;
          // Art Deco diamond sparkle + soft bokeh core
          float diamond = abs(p.x) + abs(p.y);
          float dCircle = length(p);
          float shape = smoothstep(0.48, 0.05, mix(dCircle, diamond * 0.82, 0.55));
          if (shape <= 0.01 || vDepthFade <= 0.01) discard;

          vec3 gold = mix(vec3(0.86, 0.65, 0.22), vec3(1.0, 0.94, 0.76), vTwinkle);
          gl_FragColor = vec4(gold * (0.75 + vTwinkle * 0.65), shape * vDepthFade * 0.72);
        }
      `,
    });

    this.dustPoints = new THREE.Points(dustGeo, dustMat);
    this.scene.add(this.dustPoints);
  }

  private buildAllCards() {
    for (const rig of this.cardRigs) {
      this.scene.remove(rig.root);
      rig.dispose();
    }
    this.cardRigs = [];

    for (const chapter of SEQUENCE_CHAPTERS) {
      const rig = createGatsbyCardRig(chapter, {
        heroOverride: chapter.archetype === 'gatsby_hero' ? this.heroConfig : undefined,
        style: this.frameStyle,
      });
      rig.root.scale.setScalar(this.viewportFit.cardScale);
      this.scene.add(rig.root);
      this.cardRigs.push(rig);
    }
  }

  public updateHeroTitle(newConfig: HeroTitleConfig) {
    this.heroConfig = { ...newConfig };
    // Rebuild only the Hero Card (index 4) for instant zero-hitch customization!
    const heroIdx = SEQUENCE_CHAPTERS.findIndex((c) => c.archetype === 'gatsby_hero');
    if (heroIdx !== -1 && this.cardRigs[heroIdx]) {
      this.scene.remove(this.cardRigs[heroIdx].root);
      this.cardRigs[heroIdx].dispose();

      const updatedRig = createGatsbyCardRig(SEQUENCE_CHAPTERS[heroIdx], {
        heroOverride: this.heroConfig,
        style: this.frameStyle,
      });
      updatedRig.root.scale.setScalar(this.viewportFit.cardScale);
      this.scene.add(updatedRig.root);
      this.cardRigs[heroIdx] = updatedRig;
    }
  }

  public jumpToChapter(index: number) {
    const clamped = Math.max(0, Math.min(SEQUENCE_CHAPTERS.length - 1, index));
    const ch = SEQUENCE_CHAPTERS[clamped];
    this.currentTime = ch.startTime + 0.15;
    if (this.cameraMode === 'orbit') {
      this.focusOrbitOnChapter(clamped);
    }
  }

  public setTime(t: number) {
    this.currentTime = THREE.MathUtils.clamp(t, 0, TOTAL_SEQUENCE_DURATION - 0.001);
  }

  public setPlaying(playing: boolean) {
    this.isPlaying = playing;
  }

  public togglePlaying(): boolean {
    this.isPlaying = !this.isPlaying;
    return this.isPlaying;
  }

  public setCameraMode(mode: CameraMode) {
    this.cameraMode = mode;
    this.controls.enabled = mode === 'orbit';
    if (mode === 'orbit') {
      const idx = this.getActiveChapterIndex(this.currentTime);
      this.focusOrbitOnChapter(idx);
    } else {
      this.camera.up.set(0, 1, 0);
    }
  }

  private focusOrbitOnChapter(idx: number) {
    const ch = SEQUENCE_CHAPTERS[idx];
    // Advance into the hold portion of the card if currently at the very start so user sees full frame
    const local = (this.currentTime - ch.startTime) / (ch.endTime - ch.startTime);
    if (local < 0.42 || local > 0.85) {
      this.currentTime = ch.startTime + (ch.endTime - ch.startTime) * 0.56;
      this.isPlaying = false;
    }
    this.controls.target.set(0, 0, ch.zPosition);
    this.camera.position.set(2.4, 0.9, ch.zPosition + 9.2);
    this.controls.update();
  }

  /** Coalesces both surface styles to one geometry rebuild per animation frame. */
  private scheduleFrameRebuild() {
    if (this.frameApplyHandle !== null) return;
    this.frameApplyHandle = requestAnimationFrame(() => {
      this.frameApplyHandle = null;
      for (const rig of this.cardRigs) rig.setFrameStyle(this.frameStyle);

    });
  }

  public setSequenceFrameStyle(style: FrameStyle) {
    this.frameStyle = {
      intricacy: THREE.MathUtils.clamp(style.intricacy, 0, 1),
      formula: {
        source: style.formula.source,
        level: THREE.MathUtils.clamp(Math.round(style.formula.level), 1, 4),
        genome: clampGenome(style.formula.genome),
        layers: style.formula.layers?.map((layer) => ({
          source: layer.source,
          enabled: layer.enabled,
          level: THREE.MathUtils.clamp(Math.round(layer.level), 1, 4),
        })) ?? [],
      },
    };
    this.scheduleFrameRebuild();
  }

  public setScreenBorderStyle(style: ScreenBorderStyle) {
    this.screenBorderStyle = {
      weight: THREE.MathUtils.clamp(style.weight, 0, 1),
      genome: clampGenome(style.genome),
    };
    this.screenBorderRig.setStyle(this.screenBorderStyle);
  }

  public setScreenBorderEnabled(enabled: boolean) {
    this.screenBorderEnabled = enabled;
    this.screenBorderRig.setEnabled(enabled);
  }

  public setNitrateMode(enabled: boolean) {
    this.forceNitrateMode = enabled;
  }

  private getActiveChapterIndex(t: number): number {
    return activeChapterIndex(t, SEQUENCE_CHAPTERS);
  }

  private handleResize = () => {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.viewportFit = resolveViewportFit(width, height, this.hasCoarsePointer);
    for (const rig of this.cardRigs) rig.root.scale.setScalar(this.viewportFit.cardScale);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
    this.bloomPass.resolution.set(width, height);
    this.nitratePass.uniforms.uAspect.value = width / height;
    this.screenBorderRig.setViewport(width / Math.max(1, height));
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (this.freezeAt !== null) return;
    const nx = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
    const ny = -((e.clientY / Math.max(1, window.innerHeight)) * 2 - 1);
    this.pointerTarget.set(nx, ny);
  };

  private animate = () => {
    this.rafId = requestAnimationFrame(this.animate);

    const dt = this.freezeAt === null ? Math.min(0.05, this.clock.getDelta()) : 0;
    const elapsed = this.freezeAt ?? this.clock.elapsedTime;

    if (this.isPlaying) {
      this.currentTime += dt;
      if (this.currentTime >= TOTAL_SEQUENCE_DURATION) {
        this.currentTime = 0;
      }
    }

    const t = this.currentTime;
    const activeIdx = this.getActiveChapterIndex(t);

    if (activeIdx !== this.lastChapterIdx) {
      this.lastChapterIdx = activeIdx;
      this.onChapterChange?.(activeIdx);
    }

    this.pointerSmooth.lerp(this.pointerTarget, Math.min(1, dt * 4.5));

    // Update each card's golden frame draw-on, typography wipe, and theatrical gate parting
    for (let i = 0; i < this.cardRigs.length; i++) {
      const rig = this.cardRigs[i];
      const ch = rig.chapter;
      const dur = ch.endTime - ch.startTime;
      const localT = (t - ch.startTime) / dur;
      const isFinale = i === this.cardRigs.length - 1;
      // Draw-on, text wipe, gate parting and fade live in ./choreography.
      rig.updateState({ ...cardPhase(localT, isFinale), time: elapsed });
    }

    // Camera Z-Axis Theatrical Fly-Through Choreography
    const activeCh = SEQUENCE_CHAPTERS[activeIdx];
    const chDur = activeCh.endTime - activeCh.startTime;
    const chLocal = THREE.MathUtils.clamp((t - activeCh.startTime) / chDur, 0, 1);

    if (this.cameraMode === 'cinema') {
      // Aspect-responsive framing pull-back so narrower viewports never clip side chevron/diamond wings
      const aspectPullback = this.viewportFit.cameraPullback;

      // Hold, fly-through portal, then the grand finale's push-in — see ./choreography.
      const targetZ = cinemaCameraZ({
        chapters: SEQUENCE_CHAPTERS,
        activeIdx,
        chapterLocal: chLocal,
        pullback: aspectPullback,
      });

      const pose = getCinemaCameraPose(this.viewportFit, this.pointerSmooth, elapsed);
      this.camera.position.set(pose.x, pose.y, targetZ);
      this.camera.lookAt(pose.targetX, pose.targetY, targetZ - 11.0);
      this.camera.rotation.z = pose.roll;
    } else {
      this.controls.update();
    }

    // Track recessed Art Deco wallpaper & premiere searchlights behind camera
    const anchors = rigAnchors({
      cameraMode: this.cameraMode,
      cameraZ: this.camera.position.z,
      chapterZ: activeCh.zPosition,
    });
    this.backdropGroup.position.z = anchors.backdropZ;
    const sway = searchlightSway(elapsed);
    this.searchLightL.rotation.z = sway.left;
    this.searchLightR.rotation.z = sway.right;

    // Move specular lighting rig with active card so bevelled 24k gold bars gleam dynamically
    const rig = lightRig(elapsed, anchors.lightZ);
    this.rigLightKey.position.set(...rig.key);
    this.rigLightRim.position.set(...rig.rim);
    this.rigLightCool.position.set(...rig.cool);

    // Update Distant Green Light (prominent in Act I behind the GG Signet Gate + subtle bookend)
    this.greenLightUniforms.uTime.value = elapsed;
    const glow = greenLight(t, SEQUENCE_CHAPTERS[SEQUENCE_CHAPTERS.length - 1].zPosition);
    this.greenLightUniforms.uIntensity.value = glow.intensity;
    this.greenLightMesh.position.z = glow.z;
    this.greenLightMesh.visible = glow.intensity > 0.01;

    // Update Gold Dust Uniforms
    this.dustUniforms.uTime.value = elapsed;
    this.dustUniforms.uCamZ.value = this.camera.position.z;

    // Update 1920s Silver-Nitrate Opening Transition (auto during first 2.3s of Act I, or manual toggle)
    this.nitratePass.uniforms.uTime.value = elapsed;
    this.nitratePass.uniforms.uNitrate.value = nitrateStrength(t, this.forceNitrateMode);
    this.screenBorderRig.update(elapsed);

    this.composer.render();

    // e2e waits on this before screenshotting or driving the timeline (ADDENDUM-022 §0.4).
    this.renderedFrames += 1;
    if (this.renderedFrames === 3) this.container.dataset.frameReady = 'true';

    this.onTelemetry?.({
      currentTime: this.currentTime,
      activeChapterIndex: activeIdx,
      isPlaying: this.isPlaying,
    });
  };

  public dispose() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.frameApplyHandle !== null) {
      cancelAnimationFrame(this.frameApplyHandle);
      this.frameApplyHandle = null;
    }
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('pointermove', this.handlePointerMove);

    for (const rig of this.cardRigs) {
      rig.dispose();
    }
    this.screenBorderRig.dispose();
    this.controls.dispose();
    this.envTex.dispose();
    this.composer.dispose();
    this.renderer.dispose();

    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
