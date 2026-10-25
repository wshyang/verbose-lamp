// @vitest-environment jsdom
import { fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePremiereShortcuts } from './usePremiereShortcuts';

const audio = vi.hoisted(() => ({ instances: [] as Array<{
  toggle: ReturnType<typeof vi.fn>;
  triggerActShimmer: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}> }));

vi.mock('../audio/cinemaAudio', () => ({
  CinemaAudioEngine: class {
    toggle = vi.fn(() => true);
    triggerActShimmer = vi.fn();
    dispose = vi.fn();
    constructor() {
      audio.instances.push(this);
    }
  },
}));

beforeEach(() => {
  audio.instances = [];
  window.history.replaceState(null, '', '/');
});

afterEach(() => vi.restoreAllMocks());

describe('usePremiereShortcuts', () => {
  it('handles playback, act, orbit, and HUD keys while ignoring dialogs and text entry', () => {
    const actions = {
      isDialogOpen: false,
      togglePlayback: vi.fn(), selectAct: vi.fn(), toggleCameraMode: vi.fn(), toggleHud: vi.fn(),
    };
    const { rerender, unmount } = renderHook(
      (props: typeof actions) => usePremiereShortcuts(props),
      { initialProps: actions }
    );
    expect(fireEvent.keyDown(window, { code: 'Space', key: ' ' })).toBe(false);
    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: '5' });
    fireEvent.keyDown(window, { key: '6' });
    fireEvent.keyDown(window, { key: 'O' });
    fireEvent.keyDown(window, { key: 'h' });
    fireEvent.keyDown(window, { key: 'x' });
    expect(actions.selectAct).toHaveBeenCalledTimes(2);

    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');
    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    document.body.append(input, textarea, select, editable);
    for (const element of [input, textarea, select, editable]) fireEvent.keyDown(element, { key: 'o' });
    expect(actions.toggleCameraMode).toHaveBeenCalledOnce();

    rerender({ ...actions, isDialogOpen: true });
    fireEvent.keyDown(window, { key: 'h' });
    expect(actions.toggleHud).toHaveBeenCalledOnce();
    unmount();
    fireEvent.keyDown(window, { key: 'h' });
    expect(actions.toggleHud).toHaveBeenCalledOnce();
  });
});
