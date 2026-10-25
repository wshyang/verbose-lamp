// @vitest-environment jsdom
import { fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePremiereShortcuts } from './usePremiereShortcuts';


function shortcuts({ isDialogOpen = false } = {}) {
  const actions = {
    togglePlayback: vi.fn(),
    selectAct: vi.fn(),
    toggleCameraMode: vi.fn(),
    toggleHud: vi.fn(),
  };
  const { unmount } = renderHook(() => usePremiereShortcuts({ isDialogOpen, ...actions }));
  return { ...actions, unmount };
}

describe('usePremiereShortcuts', () => {
  it('toggles playback on Space and swallows the page scroll', () => {
    const s = shortcuts();
    const event = new KeyboardEvent('keydown', { key: ' ', code: 'Space', cancelable: true, bubbles: true });

    window.dispatchEvent(event);

    expect(s.togglePlayback).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('jumps to a chapter on 1–5', () => {
    const s = shortcuts();

    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: '5' });
    fireEvent.keyDown(window, { key: '6' });

    expect(s.selectAct.mock.calls).toEqual([[0], [4]]);
  });

  it('toggles the camera on O and the HUD on H, in either case', () => {
    const s = shortcuts();

    fireEvent.keyDown(window, { key: 'o' });
    fireEvent.keyDown(window, { key: 'H' });

    expect(s.toggleCameraMode).toHaveBeenCalledTimes(1);
    expect(s.toggleHud).toHaveBeenCalledTimes(1);
  });

  it('ignores everything while a dialog is open', () => {
    const s = shortcuts({ isDialogOpen: true });

    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    fireEvent.keyDown(window, { key: '3' });
    fireEvent.keyDown(window, { key: 'o' });

    expect(s.togglePlayback).not.toHaveBeenCalled();
    expect(s.selectAct).not.toHaveBeenCalled();
    expect(s.toggleCameraMode).not.toHaveBeenCalled();
  });

  it('leaves typing in form fields alone', () => {
    const s = shortcuts();
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    // jsdom does not implement isContentEditable; the hook reads it.
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    for (const element of [input, textarea, select, editable]) {
      document.body.append(element);
      fireEvent.keyDown(element, { key: ' ', code: 'Space', bubbles: true });
      fireEvent.keyDown(element, { key: '2', bubbles: true });
      element.remove();
    }

    expect(s.togglePlayback).not.toHaveBeenCalled();
    expect(s.selectAct).not.toHaveBeenCalled();
  });

  it('stops listening on unmount', () => {
    const s = shortcuts();
    s.unmount();

    fireEvent.keyDown(window, { key: ' ', code: 'Space' });

    expect(s.togglePlayback).not.toHaveBeenCalled();
  });
});

// Beyond P6's six: the details of the key handling that a later edit could quietly change.
describe('usePremiereShortcuts details', () => {
  it('lets the HUD key through while the camera key is also handled, one press each', () => {
    const s = shortcuts();

    fireEvent.keyDown(window, { key: 'o' });

    expect(s.toggleCameraMode).toHaveBeenCalledTimes(1);
    expect(s.toggleHud).not.toHaveBeenCalled();
  });

  it('does not scroll the page for keys it does not claim', () => {
    shortcuts();
    const event = new KeyboardEvent('keydown', { key: 'x', code: 'KeyX', cancelable: true, bubbles: true });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('treats 1 through 5 as the five acts and nothing else as an act', () => {
    const s = shortcuts();

    for (const key of ['0', '1', '2', '3', '4', '5', '6', '9']) fireEvent.keyDown(window, { key });

    expect(s.selectAct.mock.calls.map(([index]) => index)).toEqual([0, 1, 2, 3, 4]);
  });

  it('reads the latest actions without re-subscribing for each render', () => {
    const first = vi.fn();
    const second = vi.fn();
    const base = { isDialogOpen: false, selectAct: vi.fn(), toggleCameraMode: vi.fn(), toggleHud: vi.fn() };
    const { rerender } = renderHook(({ togglePlayback }) => usePremiereShortcuts({ ...base, togglePlayback }), {
      initialProps: { togglePlayback: first },
    });

    rerender({ togglePlayback: second });
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('resumes handling keys when a dialog closes', () => {
    const actions = { togglePlayback: vi.fn(), selectAct: vi.fn(), toggleCameraMode: vi.fn(), toggleHud: vi.fn() };
    const { rerender } = renderHook(({ isDialogOpen }) => usePremiereShortcuts({ isDialogOpen, ...actions }), {
      initialProps: { isDialogOpen: true },
    });

    fireEvent.keyDown(window, { key: 'h' });
    expect(actions.toggleHud).not.toHaveBeenCalled();

    rerender({ isDialogOpen: false });
    fireEvent.keyDown(window, { key: 'h' });
    expect(actions.toggleHud).toHaveBeenCalledTimes(1);
  });
});

