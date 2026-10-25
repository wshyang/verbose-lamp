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
import { SIGNATURE_GENOME } from '@/features/art-deco-frame';
import { createScreenBorderRig, type ScreenBorderRig } from '@/features/art-deco-frame';
import { getCinemaCameraPose, resolveViewportFit, ViewportFit } from './responsiveLayout';
import {
  activeChapterIndex,
  cardPhase,
  cardRole,
  chapterProgress,
  cinemaCameraZ,
  clamp,
  greenLight,
  lightRig,
  nitrateLevel,
  rigAnchors,
  searchlightSway,
} from './choreography';
import { orbitFocusPlan } from './orbitFocus';
import type { PlaybackTelemetry, SceneCallbacks } from './sceneApi';
import { advanceClock } from './playback';
import {
  chapterJumpTarget,
  clampFrameStyle,
  clampScreenBorderStyle,
  clampSequenceTime,
} from './styleClamp';
import {
  cinemaNitrateFrag,
  cinemaNitrateVert,
  createCinemaNitrateUniforms,
  createGoldDustUniforms,
  createGreenLightUniforms,
  goldDustFrag,
  goldDustVert,
  greenLightFrag,
  greenLightVert,
} from './shaders';

const CinemaNitrateShader = {
  uniforms: createCinemaNitrateUniforms(),
  vertexShader: cinemaNitrateVert,
  fragmentShader: cinemaNitrateFrag,
};

export type { PlaybackTelemetry } from './sceneApi';

export class GatsbySceneManager {
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
  private greenLightUniforms = createGreenLightUniforms();
  private dustPoints!: THREE.Points;
  private dustUniforms = createGoldDustUniforms();
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

  constructor(
    container: HTMLElement,
    callbacks?: SceneCallbacks,
  ) {
    this.container = container;
    this.hasCoarsePointer =
      window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    this.onTelemetry = callbacks?.onTelemetry;
    this.onChapterChange = callbacks?.onChapterChange;

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
      vertexShader: greenLightVert,
      fragmentShader: greenLightFrag,
    });
    this.greenLightMesh = new THREE.Mesh(greenGeo, greenMat);
    this.greenLightMesh.position.set(0, -0.15, -9.5);
    this.scene.add(this.greenLightMesh);

    // 4. Stereoscopic 3D Champagne Gold Dust & Diamond Confetti Field
    const count = 950;
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const phases = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 24;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 2] = 12 - Math.random() * 136; // spans entire theatrical Z corridor
      scales[i] = 0.4 + Math.random() * 1.8;
      phases[i] = Math.random() * Math.PI * 2;
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
      vertexShader: goldDustVert,
      fragmentShader: goldDustFrag,
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
    const target = chapterJumpTarget(index, SEQUENCE_CHAPTERS);
    this.currentTime = target.time;
    if (this.cameraMode === 'orbit') {
      this.focusOrbitOnChapter(target.index);
    }
  }

  public setTime(t: number) {
    this.currentTime = clampSequenceTime(t);
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
    const chapter = SEQUENCE_CHAPTERS[idx];
    const plan = orbitFocusPlan(this.currentTime, chapter);
    if (plan.time !== null) {
      this.currentTime = plan.time;
      this.isPlaying = false;
    }
    this.controls.target.set(...plan.target);
    this.camera.position.set(...plan.position);
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
    this.frameStyle = clampFrameStyle(style);
    this.scheduleFrameRebuild();
  }

  public setScreenBorderStyle(style: ScreenBorderStyle) {
    this.screenBorderStyle = clampScreenBorderStyle(style);
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
    const nx = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
    const ny = -((e.clientY / Math.max(1, window.innerHeight)) * 2 - 1);
    this.pointerTarget.set(nx, ny);
  };

  private animate = () => {
    this.rafId = requestAnimationFrame(this.animate);

    const dt = this.clock.getDelta();
    const elapsed = this.clock.elapsedTime;

    this.currentTime = advanceClock(
      { time: this.currentTime, isPlaying: this.isPlaying, isFrozen: false },
      dt,
    );

    const t = this.currentTime;
    const activeIdx = this.getActiveChapterIndex(t);

    if (activeIdx !== this.lastChapterIdx) {
      this.lastChapterIdx = activeIdx;
      this.onChapterChange?.(activeIdx);
    }

    this.pointerSmooth.lerp(this.pointerTarget, Math.min(1, Math.min(0.05, dt) * 4.5));

    this.stageCards(t, elapsed);

    const activeChapter = SEQUENCE_CHAPTERS[activeIdx];
    if (this.cameraMode === 'cinema') {
      this.driveCinemaCamera(activeIdx, t, elapsed);
    } else {
      this.controls.update();
    }
    this.stageAtmosphere(activeChapter.zPosition, t, elapsed);

    this.screenBorderRig.update(elapsed);
    this.composer.render();

    this.onTelemetry?.({
      currentTime: this.currentTime,
      activeChapterIndex: activeIdx,
      isPlaying: this.isPlaying,
    });
  };

  /** Draw-on, text wipe, gate parting and fade of every card (see `cardPhase`). */
  private stageCards(t: number, elapsed: number) {
    for (let i = 0; i < this.cardRigs.length; i++) {
      const rig = this.cardRigs[i];
      const phase = cardPhase({
        localT: chapterProgress(t, rig.chapter),
        role: cardRole(i, this.cardRigs.length),
      });
      rig.updateState({ ...phase, time: elapsed });
    }
  }

  /** The cinema fly-through camera, pulled back on narrow viewports (see `cinemaCameraZ`). */
  private driveCinemaCamera(activeIdx: number, t: number, elapsed: number) {
    const chapter = SEQUENCE_CHAPTERS[activeIdx];
    const targetZ = cinemaCameraZ({
      chapters: SEQUENCE_CHAPTERS,
      activeIdx,
      chapterLocal: clamp(chapterProgress(t, chapter), 0, 1),
      pullback: this.viewportFit.cameraPullback,
    });
    const pose = getCinemaCameraPose(this.viewportFit, this.pointerSmooth, elapsed);
    this.camera.position.set(pose.x, pose.y, targetZ);
    this.camera.lookAt(pose.targetX, pose.targetY, targetZ - 11.0);
    this.camera.rotation.z = pose.roll;
  }

  /** Wallpaper, searchlights, moving lights, green light, dust and nitrate for this frame. */
  private stageAtmosphere(chapterZ: number, t: number, elapsed: number) {
    const anchors = rigAnchors({
      cameraMode: this.cameraMode,
      cameraZ: this.camera.position.z,
      chapterZ,
    });
    this.backdropGroup.position.z = anchors.backdropZ;
    const sway = searchlightSway(elapsed);
    this.searchLightL.rotation.z = sway.left;
    this.searchLightR.rotation.z = sway.right;

    const rig = lightRig(elapsed, anchors.lightZ);
    this.rigLightKey.position.set(...rig.key);
    this.rigLightRim.position.set(...rig.rim);
    this.rigLightCool.position.set(...rig.cool);

    const heroZ = SEQUENCE_CHAPTERS[SEQUENCE_CHAPTERS.length - 1].zPosition;
    const green = greenLight(t, heroZ);
    this.greenLightUniforms.uTime.value = elapsed;
    this.greenLightUniforms.uIntensity.value = green.intensity;
    this.greenLightMesh.position.z = green.z;
    this.greenLightMesh.visible = green.intensity > 0.01;

    this.dustUniforms.uTime.value = elapsed;
    this.dustUniforms.uCamZ.value = this.camera.position.z;

    this.nitratePass.uniforms.uTime.value = elapsed;
    this.nitratePass.uniforms.uNitrate.value = nitrateLevel(t, this.forceNitrateMode ? 'forced' : 'auto');
  }

  public dispose() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
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
