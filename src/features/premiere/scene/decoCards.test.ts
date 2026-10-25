// @vitest-environment jsdom
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_FRAME_STYLE, type FrameStyle } from '@/features/art-deco-frame';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { createGatsbyCardRig } from './decoCards';

const frameOf = (rig: ReturnType<typeof createGatsbyCardRig>) =>
  rig.root.children.find((child): child is THREE.Mesh => child instanceof THREE.Mesh && !child.userData.isText);

const latticeStyle = (overrides: Partial<FrameStyle['formula']> = {}): FrameStyle => ({
  ...DEFAULT_FRAME_STYLE,
  formula: { ...DEFAULT_FRAME_STYLE.formula, ...overrides },
});

const colour = (mesh: THREE.Mesh) => (mesh.material as THREE.MeshStandardMaterial).color.getHexString();

describe('createGatsbyCardRig frame finish', () => {
  const chapter = SEQUENCE_CHAPTERS[1];

  it('is delivered gold for the default authored frame', () => {
    const rig = createGatsbyCardRig(chapter);

    expect(colour(frameOf(rig)!)).toBe('f4c95d');
    rig.dispose();
  });

  it('starts in brass when the card is created with a lattice foundation', () => {
    const rig = createGatsbyCardRig(chapter, { style: latticeStyle({ source: 'lattice' }) });

    expect(colour(frameOf(rig)!)).toBe('ba9c72');
    rig.dispose();
  });

  it('swaps to brass when a lattice foundation arrives, and back to gold when it leaves', () => {
    const rig = createGatsbyCardRig(chapter);
    const mesh = frameOf(rig)!;

    rig.setFrameStyle(latticeStyle({ source: 'lattice' }));
    expect(colour(mesh)).toBe('ba9c72');

    rig.setFrameStyle(DEFAULT_FRAME_STYLE);
    expect(colour(mesh)).toBe('f4c95d');
    rig.dispose();
  });

  it('turns brass for an enabled lattice layer over another foundation', () => {
    const rig = createGatsbyCardRig(chapter);

    rig.setFrameStyle(latticeStyle({ layers: [{ source: 'lattice', enabled: true, level: 3 }] }));

    expect(colour(frameOf(rig)!)).toBe('ba9c72');
    rig.dispose();
  });

  it('keeps the same material when the finish does not change', () => {
    const rig = createGatsbyCardRig(chapter);
    const mesh = frameOf(rig)!;
    const material = mesh.material;

    rig.setFrameStyle({ ...DEFAULT_FRAME_STYLE, intricacy: 0.9 });

    expect(mesh.material).toBe(material);
    rig.dispose();
  });

  it('disposes the material it replaces', () => {
    const rig = createGatsbyCardRig(chapter);
    const mesh = frameOf(rig)!;
    const gold = mesh.material as THREE.Material;
    let isDisposed = false;
    gold.addEventListener('dispose', () => {
      isDisposed = true;
    });

    rig.setFrameStyle(latticeStyle({ source: 'lattice' }));

    expect(isDisposed).toBe(true);
    rig.dispose();
  });
});
