// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { setupDomTests } from '../../../test/dom';
import { installCanvas2d } from '../../../test/canvas2d';
import { DEFAULT_FRAME_STYLE, type FrameStyle } from '@/features/art-deco-frame';

/** jsdom has no `Path2D`; the alphabet only needs the drawing surface. */
class StubPath2D {
  moveTo() {}
  lineTo() {}
  arc() {}
  quadraticCurveTo() {}
  bezierCurveTo() {}
  closePath() {}
}

vi.stubGlobal('Path2D', StubPath2D);

import { createGatsbyCardRig } from './decoCards';
import type { SequenceChapter } from '../model/types';

setupDomTests();

beforeEach(() => {
  installCanvas2d();
});

const chapter = (overrides: Partial<SequenceChapter> = {}): SequenceChapter => ({
  id: 'act-1',
  actNumber: 'I',
  label: 'The Green Light',
  archetype: 'ziggurat_chevron',
  startTime: 0,
  endTime: 8,
  zPosition: -12,
  mainLine: 'EAST EGG',
  description: 'A single light across the bay.',
  ...overrides,
});

const hero = () =>
  chapter({
    id: 'hero',
    archetype: 'gatsby_hero',
    zPosition: 0,
    topLine: 'THE',
    middleLine: 'GREAT',
    mainLine: 'GATSBY',
    bottomLine: 'F. SCOTT FITZGERALD',
  });

/** Reads the reveal uniforms a text rig feeds to its own injected shader. */
function revealOf(node: THREE.Object3D) {
  const material = (node as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
  if (!material?.onBeforeCompile) return null;
  const shader = { uniforms: {} as Record<string, { value: number }>, vertexShader: '', fragmentShader: '' };
  material.onBeforeCompile(shader as never, {} as never);
  return {
    reveal: shader.uniforms.uReveal.value,
    shimmer: shader.uniforms.uShimmer.value,
    opacity: shader.uniforms.uOpacity.value,
  };
}

describe('createGatsbyCardRig', () => {
  it('places the card at the chapter depth and exposes the chapter', () => {
    const rig = createGatsbyCardRig(chapter({ zPosition: -31.5 }));

    expect(rig.chapter.id).toBe('act-1');
    expect(rig.root.position.z).toBe(-31.5);
  });

  it('assembles main typography plus a gold frame for a regular chapter', () => {
    const { root } = createGatsbyCardRig(chapter());

    // One main title group, then the frame mesh.
    expect(root.children).toHaveLength(2);
    const [title, frame] = root.children;
    expect(title).toBeInstanceOf(THREE.Group);
    expect(frame).toBeInstanceOf(THREE.Mesh);
    // Regular cards sit just above the frame centre at z = 0.14.
    expect(title.position.toArray()).toEqual([0, 0.02, 0.14]);
    // No optional billing lines when the chapter has none.
    expect(title.children).toHaveLength(12);
  });

  it('stacks keystone, pre-title, title and credit for the hero card', () => {
    const { root } = createGatsbyCardRig(hero());

    expect(root.children).toHaveLength(5);
    const [main, mid, top, bottom] = root.children as THREE.Group[];
    expect(main.position.y).toBe(-0.36);
    expect(mid.position.y).toBe(1.36);
    expect(top.position.y).toBe(2.48);
    expect(top.position.z).toBe(0.24);
    // The credit sits in the lower pediment band, in front of the frame's crest.
    expect(bottom.position.y).toBe(-1.77);
    expect(bottom.position.z).toBe(0.22);
  });

  it('lets the hero override replace every line and the alternation flag', () => {
    const rig = createGatsbyCardRig(hero(), {
      heroOverride: {
        keystone: 'A',
        preTitle: 'B',
        mainTitle: 'C',
        subCredit: 'D',
        pinstripeAlternation: false,
      },
    });

    // All four lines are non-empty, so all four rigs exist.
    expect(rig.root.children).toHaveLength(5);
  });

  it('skips a hero line that is blank after trimming', () => {
    const rig = createGatsbyCardRig(hero(), {
      heroOverride: {
        keystone: '   ',
        preTitle: 'GREAT',
        mainTitle: 'GATSBY',
        subCredit: '',
        pinstripeAlternation: true,
      },
    });

    // Main + pre-title + frame.
    expect(rig.root.children).toHaveLength(3);
  });

  it('replaces the main title with the alphabet when the line is empty', () => {
    const rig = createGatsbyCardRig(chapter({ mainLine: '' }));

    const title = rig.root.children[0] as THREE.Group;
    expect(title.children).toHaveLength(12);
  });

  it('builds a monogram gate with billing lines but no centre title', () => {
    const rig = createGatsbyCardRig(
      chapter({
        archetype: 'monogram_gate',
        topLine: 'METRO-GOLDWYN-MAYER',
        bottomLine: 'PICTURE',
        mainLine: 'MG',
      })
    );

    expect(rig.root.children).toHaveLength(3);
    const [top, bottom, frame] = rig.root.children;
    expect(top.position.y).toBe(2.15);
    expect(bottom.position.y).toBe(-2.15);
    expect(frame).toBeInstanceOf(THREE.Mesh);
  });

  it('omits monogram billing lines that are blank', () => {
    const rig = createGatsbyCardRig(
      chapter({ archetype: 'monogram_gate', topLine: '  ', bottomLine: '', mainLine: 'MG' })
    );

    expect(rig.root.children).toHaveLength(1);
    expect(rig.root.children[0]).toBeInstanceOf(THREE.Mesh);
  });

  it('starts from the default style but accepts a supplied one', () => {
    const custom: FrameStyle = {
      ...DEFAULT_FRAME_STYLE,
      intricacy: DEFAULT_FRAME_STYLE.intricacy,
      formula: { ...DEFAULT_FRAME_STYLE.formula, level: 3 },
    };

    // A custom style is adopted without an extra rebuild; both render a frame.
    const rig = createGatsbyCardRig(chapter(), { style: custom });
    const frame = rig.root.children.at(-1) as THREE.Mesh;
    expect(frame.geometry).toBeInstanceOf(THREE.BufferGeometry);
    expect(frame.geometry.getAttribute('position').count).toBeGreaterThan(0);
  });

  it('ignores a style swap that changes nothing', () => {
    const rig = createGatsbyCardRig(chapter());
    const frame = rig.root.children.at(-1) as THREE.Mesh;
    const before = frame.geometry;
    const dispose = vi.spyOn(before, 'dispose');

    rig.setFrameStyle({ ...DEFAULT_FRAME_STYLE });

    expect(frame.geometry).toBe(before);
    expect(dispose).not.toHaveBeenCalled();
  });

  it('rebuilds only the frame geometry on a style change and frees the old one', () => {
    const rig = createGatsbyCardRig(chapter());
    const frame = rig.root.children.at(-1) as THREE.Mesh;
    const before = frame.geometry;
    const dispose = vi.spyOn(before, 'dispose');

    rig.setFrameStyle({
      ...DEFAULT_FRAME_STYLE,
      formula: { ...DEFAULT_FRAME_STYLE.formula, level: 4 },
    });

    expect(frame.geometry).not.toBe(before);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('clones the incoming formula so later edits cannot leak in', () => {
    const rig = createGatsbyCardRig(chapter());
    const frame = rig.root.children.at(-1) as THREE.Mesh;

    const style: FrameStyle = {
      ...DEFAULT_FRAME_STYLE,
      formula: {
        ...DEFAULT_FRAME_STYLE.formula,
        level: 5,
        genome: { ...DEFAULT_FRAME_STYLE.formula.genome },
      },
    };
    rig.setFrameStyle(style);
    frame.geometry.dispose();

    // Mutating the caller's object afterwards must not affect a second swap back.
    style.formula.level = 1;
    const rebuilt = frame.geometry;
    rig.setFrameStyle({ ...DEFAULT_FRAME_STYLE });
    expect(frame.geometry).not.toBe(rebuilt);
  });

  it('hides itself before writing any shader state when faded out', () => {
    const rig = createGatsbyCardRig(hero());
    const title = rig.root.children[0] as THREE.Group;

    rig.updateState({ drawProgress: 1, textProgress: 1, partOpen: 0, opacity: 0, time: 2 });

    expect(rig.root.visible).toBe(false);
    // Early return: the text rigs keep their initial reveal.
    expect(revealOf(title.children[0])?.opacity).toBe(1);

    rig.updateState({ drawProgress: 1, textProgress: 1, partOpen: 0, opacity: 0.011, time: 2 });
    expect(rig.root.visible).toBe(true);
  });

  it('drives the frame uniforms and the shared text reveal', () => {
    const rig = createGatsbyCardRig(hero());
    const title = rig.root.children[0] as THREE.Group;

    rig.updateState({ drawProgress: 2, textProgress: 0.4, partOpen: 0, opacity: 0.5, time: 7.25 });

    const reveal = revealOf(title.children[0])!;
    expect(reveal.reveal).toBe(0.4);
    expect(reveal.shimmer).toBe(7.25);
    // The gate is closed, so the text keeps its full share of the master fade.
    expect(reveal.opacity).toBeCloseTo(0.5, 6);
    // The text rig clamps the finished opacity, even though this path multiplies
    // by an unclamped part-open term.
    rig.updateState({ drawProgress: -4, textProgress: 0, partOpen: -1, opacity: 2, time: 0 });
    expect(revealOf(title.children[0])!.opacity).toBe(1);
    expect(revealOf(title.children[0])!.reveal).toBe(0);

    rig.updateState({ drawProgress: 0, textProgress: 0, partOpen: 1, opacity: 1, time: 8 });
    // 1 - 1 * 0.85 leaves a 15% ghost.
    expect(revealOf(title.children[0])!.opacity).toBeCloseTo(0.15, 6);
  });

  it('disposes the frame plus every text rig', () => {
    const rig = createGatsbyCardRig(hero());
    const frame = rig.root.children.at(-1) as THREE.Mesh;
    const geometryDispose = vi.spyOn(frame.geometry, 'dispose');
    const materialDispose = vi.spyOn(frame.material as THREE.Material, 'dispose');
    const textureDispose = vi.spyOn(THREE.Texture.prototype, 'dispose');

    rig.dispose();

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    // Two textures per text rig (albedo + normal), four rigs.
    expect(textureDispose).toHaveBeenCalledTimes(8);
  });
});
