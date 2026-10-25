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

// Layout facts that cannot be seen without a browser, held as numbers. The credit used to sit at
// y = -2.62, the centre of the card's bottom sunburst, so a dozen gold rays crossed the words; and
// the keystone's letters sat at z = 0.16, inside the plate's extrusion (front face about 0.14), so
// the rails cut through their back half. The plates in ADDENDUM-033 show the before and after.
describe('createGatsbyCardRig hero layout', () => {
  const hero = SEQUENCE_CHAPTERS.find((chapter) => chapter.archetype === 'gatsby_hero');
  const groups = () => {
    if (!hero) throw new Error('no hero chapter in the sequence');
    const rig = createGatsbyCardRig(hero);
    const sized = rig.root.children.filter((child): child is THREE.Group => child instanceof THREE.Group);
    rig.dispose();
    return sized;
  };

  // The lower pediment's one clear band lies between the diamond's bottom and the inner bottom rail.
  const DIAMOND_BOTTOM_Y = -1.64;
  const INNER_RAIL_Y = -1.9;
  const KEYSTONE_PLATE_FRONT_Z = 0.14;

  it('puts the credit in the clear band under the diamond, not on the fan', () => {
    const credit = groups().find((group) => group.position.y < 0 && group.position.y !== -0.36);

    expect(credit).toBeDefined();
    expect(credit!.position.y).toBeLessThan(DIAMOND_BOTTOM_Y);
    expect(credit!.position.y).toBeGreaterThan(INNER_RAIL_Y);
  });

  it('keeps the credit text short enough to sit inside that band', () => {
    const credit = groups().find((group) => group.position.y < 0 && group.position.y !== -0.36)!;
    const box = new THREE.Box3().setFromObject(credit);

    expect(box.max.y).toBeLessThanOrEqual(DIAMOND_BOTTOM_Y + 0.05);
    expect(box.min.y).toBeGreaterThanOrEqual(INNER_RAIL_Y - 0.05);
  });

  it('puts the keystone letters in front of the plate they stand on', () => {
    const keystone = groups().find((group) => group.position.y > 2);

    expect(keystone).toBeDefined();
    expect(keystone!.position.y).toBe(2.48);
    expect(keystone!.position.z).toBeGreaterThan(KEYSTONE_PLATE_FRONT_Z);
  });

  // The letters' own extrusion has to clear the plate too, not just their origin: measured as a
  // distance from the card plane, so it does not depend on where the card is placed in the corridor.
  it('keeps the whole of the keystone letters off the plate, back face included', () => {
    const card = createGatsbyCardRig(hero!);
    card.root.updateMatrixWorld(true);
    const keystone = card.root.children.find((child) => child.position.y === 2.48)!;
    const letters = new THREE.Box3().setFromObject(keystone);
    const frame = new THREE.Box3().setFromObject(card.root.children[card.root.children.length - 1]);
    card.dispose();

    // World z grows toward the camera along -z for this corridor, so "in front" is the larger z
    // value measured from the card origin.
    const planeZ = hero!.zPosition;
    expect(letters.min.z - planeZ).toBeGreaterThanOrEqual(KEYSTONE_PLATE_FRONT_Z - 1e-6);
    expect(frame.max.z - planeZ).toBeLessThanOrEqual(KEYSTONE_PLATE_FRONT_Z + 0.2);
  });

  // The monogram gate lays its two lines out differently (top and bottom at +/-2.15), so it is the
  // one non-hero card that must be excluded; every other archetype shares the -1.18 billing line.
  it('leaves every other card\'s bottom billing line where it was', () => {
    const others = SEQUENCE_CHAPTERS.filter(
      (chapter) => chapter.archetype !== 'gatsby_hero' && chapter.archetype !== 'monogram_gate' && chapter.bottomLine
    );
    expect(others.length).toBeGreaterThan(0);

    for (const chapter of others) {
      const rig = createGatsbyCardRig(chapter);
      const lines = rig.root.children
        .filter((child): child is THREE.Group => child instanceof THREE.Group)
        .map((group) => group.position.y);
      rig.dispose();

      expect(lines, chapter.id).toContain(-1.18);
    }
  });
});

