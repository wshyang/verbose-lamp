// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { setupDomTests } from '@/test/dom';
import { DEFAULT_FRAME_STYLE, SIGNATURE_GENOME } from '@/features/art-deco-frame';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { cardPhase } from '../scene/choreography';
import { createPremiereStore } from './premiereStore';

setupDomTests();

/**
 * The card's contract with the rig (ADDENDUM-022 §7). The rig is mocked because its
 * geometry is already pinned by `decoCards.test.ts` and the golden suites; what is new
 * here is *who drives it and when*.
 */
const rigs = vi.hoisted(() => ({ created: [] as unknown[], dispose: vi.fn() }));

vi.mock('../scene/decoCards', () => ({
  createGatsbyCardRig: (chapter: { id: string }, options: unknown) => {
    const root = new THREE.Group();
    root.name = `rig-${chapter.id}`;
    const rig = {
      chapter,
      options,
      root,
      setFrameStyle: vi.fn(),
      updateState: vi.fn(),
      dispose: vi.fn(),
    };
    rigs.created.push(rig);
    rigs.dispose = rig.dispose;
    return rig;
  },
}));

import { TitleCard } from './TitleCard';

const chapter = SEQUENCE_CHAPTERS[0];

const lastRig = () =>
  rigs.created[rigs.created.length - 1] as {
    setFrameStyle: ReturnType<typeof vi.fn>;
    updateState: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  };

describe('TitleCard', () => {
  it('drives the rig from cardPhase at the current time', async () => {
    const store = createPremiereStore();
    store.getState().setTime(4.32); // localT 0.6 of a 7.2 s card
    const renderer = await ReactThreeTestRenderer.create(
      <TitleCard store={store} chapter={chapter} index={0} isFinale={false} cardScale={1} />
    );

    await renderer.advanceFrames(1, 0.016);

    const localT = (4.32 - chapter.startTime) / (chapter.endTime - chapter.startTime);
    const rig = lastRig();
    expect(rig.updateState).toHaveBeenCalled();
    const params = rig.updateState.mock.calls.at(-1)![0];
    expect(params).toMatchObject(cardPhase(localT, false));
    expect(params.time).toBeCloseTo(store.getState().elapsed, 9);

    await renderer.unmount();
  });

  it('fades the card out past its own window', async () => {
    const store = createPremiereStore();
    store.getState().setTime(chapter.startTime + (chapter.endTime - chapter.startTime) * 1.2);
    const renderer = await ReactThreeTestRenderer.create(
      <TitleCard store={store} chapter={chapter} index={0} isFinale={false} cardScale={1} />
    );

    await renderer.advanceFrames(1, 0.016);

    expect(lastRig().updateState.mock.calls.at(-1)![0].opacity).toBe(0);
    await renderer.unmount();
  });

  it('applies a new frame style at most once per frame, even for two changes', async () => {
    const store = createPremiereStore();
    const renderer = await ReactThreeTestRenderer.create(
      <TitleCard store={store} chapter={chapter} index={0} isFinale={false} cardScale={1} />
    );
    const rig = lastRig();

    // Two slider events before any frame runs: coalesced into one rebuild.
    store.getState().setFrameStyle({ ...DEFAULT_FRAME_STYLE, intricacy: 0.2 });
    store.getState().setFrameStyle({ ...DEFAULT_FRAME_STYLE, intricacy: 0.4 });
    await renderer.advanceFrames(1, 0.016);

    expect(rig.setFrameStyle).toHaveBeenCalledTimes(1);
    expect(rig.setFrameStyle).toHaveBeenCalledWith(
      expect.objectContaining({ intricacy: 0.4 })
    );

    store.getState().setFrameStyle({ ...DEFAULT_FRAME_STYLE, intricacy: 0.6 });
    await renderer.advanceFrames(1, 0.016);
    expect(rig.setFrameStyle).toHaveBeenCalledTimes(2);

    await renderer.unmount();
  });

  it('disposes its rig exactly once on unmount', async () => {
    const store = createPremiereStore();
    const renderer = await ReactThreeTestRenderer.create(
      <TitleCard store={store} chapter={chapter} index={0} isFinale={false} cardScale={1} />
    );
    const rig = lastRig();

    await renderer.unmount();

    expect(rig.dispose).toHaveBeenCalledTimes(1);
  });

  it('scales the card to the viewport fit and re-scales when it changes', async () => {
    const store = createPremiereStore();
    const renderer = await ReactThreeTestRenderer.create(
      <TitleCard store={store} chapter={chapter} index={0} isFinale={false} cardScale={1} />
    );
    const rig = rigs.created.at(-1) as { root: THREE.Group };

    expect(rig.root.scale.x).toBe(1);

    await renderer.update(
      <TitleCard store={store} chapter={chapter} index={0} isFinale={false} cardScale={0.5} />
    );
    expect(rig.root.scale.x).toBeCloseTo(0.5, 9);

    await renderer.unmount();
  });

  it('rebuilds only the hero card when the customizer changes the title', async () => {
    const store = createPremiereStore();
    const heroIndex = SEQUENCE_CHAPTERS.findIndex((c) => c.archetype === 'gatsby_hero');
    const renderer = await ReactThreeTestRenderer.create(
      <TitleCard
        store={store}
        chapter={SEQUENCE_CHAPTERS[heroIndex]}
        index={heroIndex}
        isFinale={false}
        cardScale={1}
      />
    );
    const created = rigs.created.length;

    store.getState().setHeroTitle({
      keystone: 'THE',
      preTitle: 'GREAT',
      mainTitle: 'DAISY',
      subCredit: '',
      pinstripeAlternation: false,
    });
    await renderer.advanceFrames(1, 0.016);

    expect(rigs.created.length).toBe(created + 1);
    expect(JSON.stringify((rigs.created.at(-1) as { options: unknown }).options)).toContain('DAISY');
    await renderer.unmount();
  });

  it('does not rebuild a non-hero card when the title changes', async () => {
    const store = createPremiereStore();
    const renderer = await ReactThreeTestRenderer.create(
      <TitleCard store={store} chapter={chapter} index={0} isFinale={false} cardScale={1} />
    );
    const created = rigs.created.length;

    store.getState().setHeroTitle({
      keystone: 'A',
      preTitle: 'B',
      mainTitle: 'C',
      subCredit: 'D',
      pinstripeAlternation: true,
    });
    await renderer.advanceFrames(1, 0.016);

    expect(rigs.created.length).toBe(created);
    await renderer.unmount();
  });

  it('passes the live frame style to a rig built after a style change', async () => {
    const store = createPremiereStore();
    store.getState().setFrameStyle({ ...DEFAULT_FRAME_STYLE, intricacy: 0.33, formula: { source: 'authored', level: 3, genome: { ...SIGNATURE_GENOME } } });

    const renderer = await ReactThreeTestRenderer.create(
      <TitleCard store={store} chapter={chapter} index={0} isFinale={false} cardScale={1} />
    );

    const options = (rigs.created.at(-1) as { options: { style: { intricacy: number } } }).options;
    expect(options.style.intricacy).toBe(0.33);
    await renderer.unmount();
  });
});
