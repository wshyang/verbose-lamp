// @vitest-environment jsdom
// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import ReactThreeTestRenderer, { act } from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { createPremiereStore } from './premiereStore';
import { TitleCard } from './TitleCard';

interface FakeRig {
  chapter: { id: string };
  root: THREE.Group;
  setFrameStyle: ReturnType<typeof vi.fn>;
  updateState: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}
const rigs_p3 = vi.hoisted(() => ({ created: [] as FakeRig[] }));
vi.mock('../scene/decoCards', () => ({
  createGatsbyCardRig: (chapter: { id: string }, options: unknown) => {
    const rig = {
      chapter,
      options,
      root: new THREE.Group(),
      setFrameStyle: vi.fn(),
      updateState: vi.fn(),
      dispose: vi.fn(),
    };
    rig.root.name = `card-${chapter.id}`;
    rigs_p3.created.push(rig as unknown as FakeRig);
    return rig;
  },
}));
function reset() {
  rigs_p3.created.length = 0;
}
describe('TitleCard', () => {
  it('stages the card from the pure choreography every frame', async () => {
    reset();
    const store = createPremiereStore();
    const renderer = await ReactThreeTestRenderer.create(
      <TitleCard store={store} index={0} cardScale={1} />,
    );
    const chapter = SEQUENCE_CHAPTERS[0];
    const duration = chapter.endTime - chapter.startTime;
    store.getState().setPlaying(false);
    store.getState().setTime(4.32);

    await renderer.advanceFrames(1, 0.016);
    const rig = rigs_p3.created[0];
    const localT = (4.32 - chapter.startTime) / duration;
    const call = rig.updateState.mock.calls.at(-1)?.[0] as Record<string, number>;
    expect(call.drawProgress).toBeCloseTo(1);
    expect(call.textProgress).toBeCloseTo(1);
    expect(call.partOpen).toBeCloseTo(0);
    expect(call.opacity).toBeCloseTo(1);
    expect(call.time).toBeGreaterThanOrEqual(0);
    expect(localT).toBeGreaterThan(0);
  });

  it('hides the card off-stage through the same phase function', async () => {
    reset();
    const store = createPremiereStore();
    const renderer = await ReactThreeTestRenderer.create(
      <TitleCard store={store} index={1} cardScale={1} />,
    );
    store.getState().setPlaying(false);
    store.getState().setTime(0);

    await renderer.advanceFrames(1, 0.016);
    const call = rigs_p3.created[0].updateState.mock.calls.at(-1)?.[0] as Record<string, number>;
    expect(call.opacity).toBe(0);
  });

  it('applies a frozen clock to the card time', async () => {
    reset();
    const store = createPremiereStore({ freezeAt: 11.28 });
    const renderer = await ReactThreeTestRenderer.create(
      <TitleCard store={store} index={1} cardScale={1} />,
    );
    await renderer.advanceFrames(1, 0.016);
    const call = rigs_p3.created[0].updateState.mock.calls.at(-1)?.[0] as Record<string, number>;
    expect(call.time).toBe(11.28);
  });

  it('coalesces frame-style edits to one rebuild per frame', async () => {
    reset();
    const store = createPremiereStore();
    const renderer = await ReactThreeTestRenderer.create(
      <TitleCard store={store} index={0} cardScale={1} />,
    );
    const rig = rigs_p3.created[0];

    act(() => {
      store.getState().setSequenceFrameStyle({
        intricacy: 0.3,
        formula: { ...store.getState().frameStyle.formula },
      });
      store.getState().setSequenceFrameStyle({
        intricacy: 0.7,
        formula: { ...store.getState().frameStyle.formula },
      });
    });

    await renderer.advanceFrames(1, 0.016);
    expect(rig.setFrameStyle).toHaveBeenCalledTimes(1);
    expect(rig.setFrameStyle).toHaveBeenCalledWith(
      expect.objectContaining({ intricacy: 0.7 }),
    );

    await renderer.advanceFrames(1, 0.016);
    expect(rig.setFrameStyle).toHaveBeenCalledTimes(1);
  });

  it('scales with the viewport and disposes on unmount', async () => {
    reset();
    const store = createPremiereStore();
    const renderer = await ReactThreeTestRenderer.create(
      <TitleCard store={store} index={0} cardScale={0.6} />,
    );
    const rig = rigs_p3.created[0];
    expect(rig.root.scale.x).toBeCloseTo(0.6);

    await renderer.update(<TitleCard store={store} index={0} cardScale={0.8} />);
    expect(rig.root.scale.x).toBeCloseTo(0.8);

    await renderer.unmount();
    expect(rig.dispose).toHaveBeenCalledTimes(1);
  });
});
