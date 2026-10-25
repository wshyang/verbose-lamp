import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FRAME_STYLE } from '@/features/art-deco-frame';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import type { HeroTitleConfig, SequenceChapter } from '../model/types';
import { createGatsbyCardRig } from './decoCards';

const mocks = vi.hoisted(() => ({
  createText: vi.fn(),
  buildFrame: vi.fn(() => []),
  createGeometry: vi.fn(),
  textRigs: [] as Array<{ setReveal: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }>,
}));

vi.mock('@/features/art-deco-frame', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/art-deco-frame')>();
  return {
    ...actual,
    createExtrudedDecoTextMesh: mocks.createText,
    buildFrame: mocks.buildFrame,
    createChamferedFrameGeometry: mocks.createGeometry,
  };
});

const chapter = (base: SequenceChapter, patch: Record<string, unknown>): SequenceChapter =>
  ({ ...base, ...patch }) as SequenceChapter;
const texts = () => mocks.createText.mock.calls.map(([options]) => options.text);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.textRigs = [];
  mocks.createGeometry.mockImplementation(() => new THREE.BufferGeometry());
  mocks.createText.mockImplementation(() => {
    const rig = {
      group: new THREE.Group(), width: 4, height: 1,
      setReveal: vi.fn(), dispose: vi.fn(),
    };
    mocks.textRigs.push(rig);
    return rig;
  });
});

describe('createGatsbyCardRig fallback branches', () => {
  it('uses literal hero defaults when override and chapter lines are absent', () => {
    const hero = chapter(SEQUENCE_CHAPTERS[4], {
      topLine: undefined, middleLine: undefined, mainLine: undefined, bottomLine: undefined,
    });
    const rig = createGatsbyCardRig(hero);
    expect(texts()).toEqual(['GATSBY', 'GREAT', 'THE']);
    rig.updateState({ drawProgress: 0, textProgress: 0, partOpen: 0, opacity: 0, time: 0 });
    expect(rig.root.visible).toBe(false);
    expect(mocks.textRigs[0].setReveal).not.toHaveBeenCalled();
    rig.updateState({ drawProgress: 2, textProgress: 0.5, partOpen: 0, opacity: 1, time: 3 });
    expect(mocks.textRigs[0].setReveal).toHaveBeenCalledWith(0.5, 3, 1);
    rig.dispose();
    expect(mocks.textRigs.every((text) => text.dispose.mock.calls.length === 1)).toBe(true);
  });

  it('falls through an empty hero override to chapter lines', () => {
    const override = {
      keystone: undefined, preTitle: undefined, mainTitle: undefined,
      subCredit: undefined, pinstripeAlternation: undefined,
    } as unknown as HeroTitleConfig;
    const rig = createGatsbyCardRig(SEQUENCE_CHAPTERS[4], { heroOverride: override });
    expect(texts()).toEqual(['GATSBY', 'GREAT', 'THE', 'FROM THE NOVEL BY F. SCOTT FITZGERALD']);
    expect(mocks.createText.mock.calls[0][0].alternatePinstripes).toBe(true);
    rig.dispose();
  });

  it('uses supplied hero override and restyles with absent/present layers', () => {
    const rig = createGatsbyCardRig(SEQUENCE_CHAPTERS[4], {
      heroOverride: {
        keystone: 'A', preTitle: 'B', mainTitle: 'C', subCredit: 'D', pinstripeAlternation: false,
      },
      style: DEFAULT_FRAME_STYLE,
    });
    expect(texts()).toEqual(['C', 'B', 'A', 'D']);
    const firstGeometry = (rig.root.children.at(-1) as THREE.Mesh).geometry;
    rig.setFrameStyle({
      ...DEFAULT_FRAME_STYLE, intricacy: 0.2,
      formula: { ...DEFAULT_FRAME_STYLE.formula, layers: undefined },
    });
    expect((rig.root.children.at(-1) as THREE.Mesh).geometry).not.toBe(firstGeometry);
    rig.setFrameStyle({
      ...DEFAULT_FRAME_STYLE, intricacy: 0.3,
      formula: {
        ...DEFAULT_FRAME_STYLE.formula,
        layers: [{ source: 'lattice', enabled: true, level: 2 }],
      },
    });
    const current = (rig.root.children.at(-1) as THREE.Mesh).geometry;
    rig.setFrameStyle({
      ...DEFAULT_FRAME_STYLE, intricacy: 0.3,
      formula: {
        ...DEFAULT_FRAME_STYLE.formula,
        layers: [{ source: 'lattice', enabled: true, level: 2 }],
      },
    });
    expect((rig.root.children.at(-1) as THREE.Mesh).geometry).toBe(current);
    rig.dispose();
  });

  it('uses blank non-hero defaults and the Gatsby main fallback', () => {
    const regular = chapter(SEQUENCE_CHAPTERS[1], {
      topLine: undefined, middleLine: undefined, mainLine: '', bottomLine: undefined,
    });
    const rig = createGatsbyCardRig(regular, {});
    expect(texts()).toEqual(['GATSBY']);
    rig.dispose();
  });

  it('omits blank monogram billing and includes supplied billing', () => {
    const blank = chapter(SEQUENCE_CHAPTERS[0], { topLine: ' ', bottomLine: undefined });
    const blankRig = createGatsbyCardRig(blank);
    expect(texts()).toEqual([]);
    blankRig.dispose();
    mocks.createText.mockClear();
    const rig = createGatsbyCardRig(SEQUENCE_CHAPTERS[0]);
    expect(texts()).toEqual(['WARNER BROS. PICTURES & BAZMARK', 'NEW YORK · SUMMER 1922']);
    rig.dispose();
  });
});
