// @vitest-environment jsdom
// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_FRAME_STYLE, type FrameStyle, SIGNATURE_GENOME } from '@/features/art-deco-frame';
import { SEQUENCE_CHAPTERS, DEFAULT_HERO_TITLE } from '../data/sequence';
import { createGatsbyCardRig } from './decoCards';

const chapterOf = (id: string) => SEQUENCE_CHAPTERS.find((chapter) => chapter.id === id)!;
function uniformValues(rig: ReturnType<typeof createGatsbyCardRig>) {
  const mesh = rig.root.children.find(
    (child) => (child as THREE.Mesh).material instanceof THREE.MeshStandardMaterial,
  ) as THREE.Mesh;
  const material = mesh.material as THREE.MeshStandardMaterial;
  const shader = {
    uniforms: {} as Record<string, { value: number }>,
    vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: '#include <common>',
  };
  (material.onBeforeCompile as unknown as (s: unknown) => void)(shader);
  return shader.uniforms;
}
describe('createGatsbyCardRig', () => {
  it.each(SEQUENCE_CHAPTERS.map((chapter) => chapter.id))('builds the %s card at its Z station', (id) => {
    const chapter = chapterOf(id);
    const rig = createGatsbyCardRig(chapter);
    expect(rig.chapter).toBe(chapter);
    expect(rig.root.position.z).toBe(chapter.zPosition);
    expect(rig.root.children.length).toBeGreaterThan(0);
    rig.dispose();
  });

  it('draws the monogram billing lines without 3D lettering', () => {
    const rig = createGatsbyCardRig(chapterOf('monogram'));
    expect(rig.root.children.length).toBe(3);
    rig.dispose();
  });

  it('uses the hero override for every line of the finale card', () => {
    const hero = chapterOf('hero');
    const rig = createGatsbyCardRig(hero, {
      heroOverride: { ...DEFAULT_HERO_TITLE, mainTitle: 'CARRAWAY', pinstripeAlternation: false },
    });
    expect(rig.root.children.length).toBeGreaterThan(3);
    rig.dispose();
  });

  it('applies draw, gate and opacity state to the shader uniforms', () => {
    const rig = createGatsbyCardRig(chapterOf('dicaprio'));
    const uniforms = uniformValues(rig);

    rig.updateState({ drawProgress: 0.4, textProgress: 0.6, partOpen: 0.2, opacity: 0.8, time: 3 });
    expect(rig.root.visible).toBe(true);
    expect(uniforms.uDraw.value).toBeCloseTo(0.4);
    expect(uniforms.uPartOpen.value).toBeCloseTo(0.2);
    expect(uniforms.uOpacity.value).toBeCloseTo(0.8);
    expect(uniforms.uTime.value).toBe(3);

    rig.updateState({ drawProgress: 2, textProgress: 1, partOpen: 3, opacity: 2, time: 4 });
    expect(uniforms.uDraw.value).toBe(1);
    expect(uniforms.uPartOpen.value).toBe(1);
    expect(uniforms.uOpacity.value).toBe(1);

    rig.updateState({ drawProgress: 0, textProgress: 0, partOpen: 0, opacity: 0, time: 5 });
    expect(rig.root.visible).toBe(false);
    rig.dispose();
  });

  it('swaps frame geometry only when the style really changes', () => {
    const rig = createGatsbyCardRig(chapterOf('ensemble'), { style: DEFAULT_FRAME_STYLE });
    const mesh = rig.root.children.find(
      (child) => (child as THREE.Mesh).material instanceof THREE.MeshStandardMaterial,
    ) as THREE.Mesh;
    const original = mesh.geometry;
    const dispose = vi.spyOn(original, 'dispose');

    rig.setFrameStyle({ ...DEFAULT_FRAME_STYLE, formula: { ...DEFAULT_FRAME_STYLE.formula } });
    expect(mesh.geometry).toBe(original);
    expect(dispose).not.toHaveBeenCalled();

    const next: FrameStyle = {
      intricacy: 0.9,
      formula: { ...DEFAULT_FRAME_STYLE.formula, genome: { ...SIGNATURE_GENOME, cornerScale: 1.3 } },
    };
    rig.setFrameStyle(next);
    expect(mesh.geometry).not.toBe(original);
    expect(dispose).toHaveBeenCalledTimes(1);
    rig.dispose();
  });

  it('disposes frame geometry, material and typography on teardown', () => {
    const rig = createGatsbyCardRig(chapterOf('director'));
    const meshes = rig.root.children.filter((child) => child instanceof THREE.Mesh) as THREE.Mesh[];
    const disposals = meshes.map((mesh) => vi.spyOn(mesh.material as THREE.Material, 'dispose'));

    rig.dispose();
    for (const dispose of disposals) expect(dispose).toHaveBeenCalled();
  });
});
describe('createGatsbyCardRig with sparse billing lines', () => {
  const sparseChapter = (archetype: 'gatsby_hero' | 'monogram_gate' | 'actor_portrait') => ({
    id: 'sparse',
    actNumber: 'I',
    label: 'Sparse',
    archetype,
    startTime: 0,
    endTime: 1,
    zPosition: -20,
    mainLine: '',
    description: 'no billing lines',
  });
  const sparse = (archetype: 'gatsby_hero' | 'monogram_gate' | 'actor_portrait'): never =>
    sparseChapter(archetype) as never;

  it('drops every optional line from a bare monogram gate', () => {
    const rig = createGatsbyCardRig(sparse('monogram_gate'));
    expect(rig.root.children.length).toBe(1);
    rig.dispose();
  });

  it('skips missing billing lines on a plain card', () => {
    const rig = createGatsbyCardRig(sparse('actor_portrait'));
    expect(rig.root.children.length).toBeGreaterThan(0);
    rig.dispose();
  });
});
