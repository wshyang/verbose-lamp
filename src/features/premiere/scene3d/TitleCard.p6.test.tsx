// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { setupDomTests } from '@/test/dom';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
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

  it('fades the card out past its own window', async () => {
    const store = createPremiereStore();
    store.getState().setTime(chapter.startTime + (chapter.endTime - chapter.startTime) * 1.2);
    const renderer = await ReactThreeTestRenderer.create(
      <TitleCard store={store} index={0} cardScale={1} />
    );

    await renderer.advanceFrames(1, 0.016);

    expect(lastRig().updateState.mock.calls.at(-1)![0].opacity).toBe(0);
    await renderer.unmount();
  });

  it('scales the card to the viewport fit and re-scales when it changes', async () => {
    const store = createPremiereStore();
    const renderer = await ReactThreeTestRenderer.create(
      <TitleCard store={store} index={0} cardScale={1} />
    );
    const rig = rigs.created.at(-1) as { root: THREE.Group };

    expect(rig.root.scale.x).toBe(1);

    await renderer.update(
      <TitleCard store={store} index={0} cardScale={0.5} />
    );
    expect(rig.root.scale.x).toBeCloseTo(0.5, 9);

    await renderer.unmount();
  });
});
