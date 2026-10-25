// @vitest-environment jsdom
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

// The card's contract with the rig: its geometry is already pinned by the golden suites, so
// the rig is mocked at its module seam and what is under test is *who drives it and when*.
const rigs = vi.hoisted(() => ({
  created: [] as Array<{
    chapter: { id: string; archetype: string };
    options: { heroOverride?: { mainTitle?: string }; style?: { intricacy: number } };
    root: THREE.Group;
    setFrameStyle: ReturnType<typeof vi.fn>;
    updateState: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock('../scene/decoCards', () => ({
  createGatsbyCardRig: (
    chapter: { id: string; archetype: string },
    options: { heroOverride?: { mainTitle?: string }; style?: { intricacy: number } },
  ) => {
    const rig = {
      chapter,
      options,
      root: new THREE.Group(),
      setFrameStyle: vi.fn(),
      updateState: vi.fn(),
      dispose: vi.fn(),
    };
    rigs.created.push(rig);
    return rig;
  },
}));

import { DEFAULT_FRAME_STYLE, SIGNATURE_GENOME } from '@/features/art-deco-frame';
import { DEFAULT_HERO_TITLE, SEQUENCE_CHAPTERS } from '../data/sequence';
import { cardPhase, cardRole, chapterProgress } from '../scene/choreography';
import { createPremiereStore } from './premiereStore';
import { TitleCard } from './TitleCard';

const last = () => rigs.created[rigs.created.length - 1];
const HERO = SEQUENCE_CHAPTERS.findIndex((c) => c.archetype === 'gatsby_hero');

function mount(index: number, store = createPremiereStore(), cardScale = 1) {
  return ReactThreeTestRenderer.create(<TitleCard store={store} index={index} cardScale={cardScale} />);
}

// Expected card states are `cardPhase` for the same input, which the choreography suite
// pins against the shipped manager's arithmetic.
describe('TitleCard staging', () => {
  it('drives the rig from the card phase at the current time, on the shader clock', async () => {
    const t = SEQUENCE_CHAPTERS[1].startTime + 2;
    const store = createPremiereStore({ freezeAt: t });
    const renderer = await mount(1, store);

    await renderer.advanceFrames(1, 0.016);

    const chapter = SEQUENCE_CHAPTERS[1];
    const expected = cardPhase({
      localT: chapterProgress(t, chapter),
      role: cardRole(1, SEQUENCE_CHAPTERS.length),
    });
    expect(last().updateState).toHaveBeenLastCalledWith({ ...expected, time: store.getState().elapsed });
    await renderer.unmount();
  });

  it('switches a card off outside its own window', async () => {
    const store = createPremiereStore({ freezeAt: SEQUENCE_CHAPTERS[4].startTime + 1 });
    const renderer = await mount(0, store);

    await renderer.advanceFrames(1, 0.016);

    expect(last().updateState).toHaveBeenLastCalledWith({
      drawProgress: 0,
      textProgress: 0,
      partOpen: 0,
      opacity: 0,
      time: store.getState().elapsed,
    });
    await renderer.unmount();
  });

  it('keeps the finale gate shut where a standard card would be parting', async () => {
    const finale = SEQUENCE_CHAPTERS.length - 1;
    const chapter = SEQUENCE_CHAPTERS[finale];
    const store = createPremiereStore({
      freezeAt: chapter.startTime + (chapter.endTime - chapter.startTime) * 0.9,
    });
    const renderer = await mount(finale, store);

    await renderer.advanceFrames(1, 0.016);

    expect(last().updateState.mock.calls.at(-1)![0].partOpen).toBe(0);
    await renderer.unmount();
  });

  it('pins the shader time of a frozen card to the frozen moment', async () => {
    const store = createPremiereStore({ freezeAt: 3 });
    const renderer = await mount(0, store);

    await renderer.advanceFrames(4, 0.016);

    expect(last().updateState.mock.calls.at(-1)![0].time).toBe(3);
    await renderer.unmount();
  });
});

describe('TitleCard construction and teardown', () => {
  it('builds its rig for its own chapter with the live frame style', async () => {
    const store = createPremiereStore();
    store.getState().setSequenceFrameStyle({
      ...DEFAULT_FRAME_STYLE,
      intricacy: 0.33,
      formula: { source: 'authored', level: 3, genome: { ...SIGNATURE_GENOME } },
    });
    const renderer = await mount(2, store);

    expect(last().chapter).toBe(SEQUENCE_CHAPTERS[2]);
    expect(last().options.style?.intricacy).toBe(0.33);
    await renderer.unmount();
  });

  it('scales its root to the viewport fit, and re-scales without rebuilding', async () => {
    const store = createPremiereStore();
    const renderer = await mount(0, store, 0.5);
    const built = rigs.created.length;
    expect(last().root.scale.x).toBe(0.5);

    await renderer.update(<TitleCard store={store} index={0} cardScale={0.8} />);

    expect(last().root.scale.x).toBe(0.8);
    expect(rigs.created.length).toBe(built);
    await renderer.unmount();
  });

  it('adds the rig root to the scene and disposes the rig exactly once on unmount', async () => {
    const renderer = await mount(0);
    const rig = last();
    expect(renderer.scene.findAll((node) => node.instance === rig.root)).toHaveLength(1);

    await renderer.unmount();

    expect(rig.dispose).toHaveBeenCalledTimes(1);
  });
});

describe('TitleCard frame style', () => {
  it('re-applies a new frame style once, not once per edit', async () => {
    const store = createPremiereStore();
    const renderer = await mount(0, store);
    const rig = last();

    store.getState().setSequenceFrameStyle({ ...DEFAULT_FRAME_STYLE, intricacy: 0.9 });
    store.getState().setSequenceFrameStyle({ ...DEFAULT_FRAME_STYLE, intricacy: 0.2 });
    await renderer.advanceFrames(3, 0.016);

    expect(rig.setFrameStyle).toHaveBeenCalledTimes(1);
    expect(rig.setFrameStyle.mock.calls[0][0].intricacy).toBe(0.2);
    await renderer.unmount();
  });

  it('does not re-apply the style it was built with', async () => {
    const renderer = await mount(0);

    await renderer.advanceFrames(5, 0.016);

    expect(last().setFrameStyle).not.toHaveBeenCalled();
    await renderer.unmount();
  });

  it('ignores a screen-border change, because cards only follow the frame style', async () => {
    const store = createPremiereStore();
    const renderer = await mount(0, store);

    store.getState().setScreenBorderStyle({ weight: 0.9, genome: { ...SIGNATURE_GENOME } });
    await renderer.advanceFrames(2, 0.016);

    expect(last().setFrameStyle).not.toHaveBeenCalled();
    await renderer.unmount();
  });
});

describe('TitleCard hero title', () => {
  it('rebuilds only the hero card when the title changes', async () => {
    const store = createPremiereStore();
    const renderer = await mount(HERO, store);
    const built = rigs.created.length;
    const first = last();

    store.getState().setHeroConfig({ ...DEFAULT_HERO_TITLE, mainTitle: 'DAISY' });
    await renderer.advanceFrames(1, 0.016);

    expect(rigs.created.length).toBe(built + 1);
    expect(last().options.heroOverride?.mainTitle).toBe('DAISY');
    expect(first.dispose).toHaveBeenCalledTimes(1);
    await renderer.unmount();
  });

  it('does not rebuild a non-hero card when the title changes', async () => {
    const store = createPremiereStore();
    const renderer = await mount(0, store);
    const built = rigs.created.length;

    store.getState().setHeroConfig({ ...DEFAULT_HERO_TITLE, mainTitle: 'DAISY' });
    await renderer.advanceFrames(1, 0.016);

    expect(rigs.created.length).toBe(built);
    expect(last().dispose).not.toHaveBeenCalled();
    await renderer.unmount();
  });

  it('gives only the hero chapter the title override', async () => {
    const hero = await mount(HERO);
    expect(last().options.heroOverride?.mainTitle).toBe(DEFAULT_HERO_TITLE.mainTitle);
    await hero.unmount();

    const other = await mount(0);
    expect(last().options.heroOverride).toBeUndefined();
    await other.unmount();
  });

  it('treats a pinstripe toggle on the title as a new card', async () => {
    const store = createPremiereStore();
    const renderer = await mount(HERO, store);
    const built = rigs.created.length;

    store.getState().setHeroConfig({ ...DEFAULT_HERO_TITLE, pinstripeAlternation: false });
    await renderer.advanceFrames(1, 0.016);

    expect(rigs.created.length).toBe(built + 1);
    await renderer.unmount();
  });
});
