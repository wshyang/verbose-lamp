// @vitest-environment jsdom
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FrameStyle } from '@/features/art-deco-frame';
import { DEFAULT_FRAME_STYLE, SIGNATURE_GENOME, type GeneKey } from '@/features/art-deco-frame';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { cardPhase } from '../scene/choreography';
import { createPremiereStore } from './premiereStore';
import { TitleCard } from './TitleCard';

/**
 * Headless scene tests (ADDENDUM-022 Phase 3, ADDENDUM-029 §2). `@react-three/
 * test-renderer` runs the real component, the real card rig and the real frame
 * material; only the GPU is missing. Assertions are on uniforms and object state,
 * never on pixels — the same rule the golden tests follow.
 */

const CHAPTER = SEQUENCE_CHAPTERS[0];
const CHAPTER_SECONDS = CHAPTER.endTime - CHAPTER.startTime;

type FrameMaterial = THREE.MeshStandardMaterial;
type FrameUniforms = Record<'uDraw' | 'uPartOpen' | 'uOpacity' | 'uTime', { value: number }>;

/** The card's gold frame material — the one with the trim-reveal program key. */
function frameMaterialOf(root: THREE.Object3D): FrameMaterial {
  let found: FrameMaterial | null = null;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    const material = mesh.material as FrameMaterial | undefined;
    if (!found && material?.customProgramCacheKey?.() === 'gatsby-gold-frame-trim-v2') found = material;
  });
  if (!found) throw new Error('no frame material on this card');
  return found;
}

/**
 * The uniforms live in the rig's closure and only reach the material when the
 * renderer compiles it. There is no GPU here, so we run the same `onBeforeCompile`
 * hook ourselves: the shader object it fills receives the rig's own uniform
 * objects by reference, which is exactly what a real compile would do.
 */
function uniformsOf(material: FrameMaterial): FrameUniforms {
  const shader = { uniforms: {} as Record<string, unknown>, vertexShader: '', fragmentShader: '' };
  material.onBeforeCompile(shader as never, null as never);
  return shader.uniforms as FrameUniforms;
}

async function mountCard(options: { localT?: number; isFinale?: boolean } = {}) {
  const store = createPremiereStore();
  if (options.localT !== undefined) store.getState().setTime(CHAPTER.startTime + options.localT * CHAPTER_SECONDS);
  const renderer = await ReactThreeTestRenderer.create(
    <TitleCard chapter={CHAPTER} isFinale={options.isFinale ?? false} scale={1} store={store} />
  );
  return { renderer, store };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TitleCard', () => {
  it('drives every frame uniform from the choreography', async () => {
    const { renderer } = await mountCard({ localT: 0.5 });
    await renderer.advanceFrames(1, 0.016);

    const expected = cardPhase({ localT: 0.5, isFinale: false });
    const uniforms = uniformsOf(frameMaterialOf(renderer.scene.instance));
    expect(uniforms.uDraw.value).toBeCloseTo(expected.drawProgress, 6);
    expect(uniforms.uPartOpen.value).toBeCloseTo(expected.partOpen, 6);
    expect(uniforms.uOpacity.value).toBeCloseTo(expected.opacity, 6);
  });

  it('matches the finale phase when it is the last card', async () => {
    const { renderer } = await mountCard({ localT: 0.95, isFinale: true });
    await renderer.advanceFrames(1, 0.016);

    const expected = cardPhase({ localT: 0.95, isFinale: true });
    const uniforms = uniformsOf(frameMaterialOf(renderer.scene.instance));
    // The finale holds instead of parting, so partOpen stays shut.
    expect(uniforms.uPartOpen.value).toBe(0);
    expect(uniforms.uOpacity.value).toBeCloseTo(expected.opacity, 6);
  });

  it('hides the root once the card is outside its window', async () => {
    const { renderer } = await mountCard({ localT: 1.2 });
    const root = renderer.scene.instance.getObjectByName(`card:${CHAPTER.id}`) as THREE.Group;
    expect(root).toBeDefined();
    await renderer.advanceFrames(1, 0.016);
    expect(root.visible).toBe(false);
  });

  it('applies the scale it is given', async () => {
    const store = createPremiereStore();
    store.getState().setTime(CHAPTER.startTime + 0.5 * CHAPTER_SECONDS);
    const renderer = await ReactThreeTestRenderer.create(
      <TitleCard chapter={CHAPTER} isFinale={false} scale={0.5} store={store} />
    );
    const root = renderer.scene.instance.getObjectByName(`card:${CHAPTER.id}`) as THREE.Group;
    expect(root.scale.x).toBe(0.5);
  });

  it('rebuilds the frame geometry once for several style changes in one frame', async () => {
    const { renderer, store } = await mountCard({ localT: 0.5 });
    await renderer.advanceFrames(1, 0.016);

    const dispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');

    const styled = (gene: GeneKey, value: number): FrameStyle => ({
      intricacy: DEFAULT_FRAME_STYLE.intricacy,
      formula: { ...DEFAULT_FRAME_STYLE.formula, genome: { ...SIGNATURE_GENOME, [gene]: value } },
    });
    store.getState().setSequenceFrameStyle(styled('rayDensity', 1.2));
    store.getState().setSequenceFrameStyle(styled('wingDelta', 2));
    await renderer.advanceFrames(1, 0.016);

    // Two slider moves, one rebuild: the old geometry is disposed exactly once.
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes the rig once when the card unmounts', async () => {
    const { renderer } = await mountCard({ localT: 0.5 });
    const dispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const materialDispose = vi.spyOn(THREE.MeshStandardMaterial.prototype, 'dispose');
    await renderer.unmount();
    expect(dispose).toHaveBeenCalled();
    expect(materialDispose).toHaveBeenCalled();
  });
});
