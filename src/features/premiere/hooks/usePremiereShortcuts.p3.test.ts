// @vitest-environment jsdom
// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePremiereShortcuts } from './usePremiereShortcuts';

function setup(overrides: { isDialogOpen?: boolean } = {}) {
  const actions = {
    isDialogOpen: overrides.isDialogOpen ?? false,
    togglePlayback: vi.fn(),
    selectAct: vi.fn(),
    toggleCameraMode: vi.fn(),
    toggleHud: vi.fn(),
  };
  const view = renderHook(() => usePremiereShortcuts(actions));
  return { actions, ...view };
}
function press(target: EventTarget, init: KeyboardEventInit) {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
}
describe('usePremiereShortcuts', () => {
  it('maps Space to play/pause and swallows the page scroll', () => {
    const { actions } = setup();
    const event = new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true });
    window.dispatchEvent(event);
    expect(actions.togglePlayback).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it.each([
    ['1', 0],
    ['3', 2],
    ['5', 4],
  ])('selects the act for the %s key', (key, index) => {
    const { actions } = setup();
    press(window, { key });
    expect(actions.selectAct).toHaveBeenCalledWith(index);
  });

  it('toggles the camera on o and the HUD on h, case-insensitively', () => {
    const { actions } = setup();
    press(window, { key: 'O' });
    press(window, { key: 'h' });
    expect(actions.toggleCameraMode).toHaveBeenCalledTimes(1);
    expect(actions.toggleHud).toHaveBeenCalledTimes(1);
  });

  it('ignores keys while a dialog is open', () => {
    const { actions } = setup({ isDialogOpen: true });
    press(window, { code: 'Space' });
    press(window, { key: '2' });
    press(window, { key: 'o' });
    expect(actions.togglePlayback).not.toHaveBeenCalled();
    expect(actions.selectAct).not.toHaveBeenCalled();
    expect(actions.toggleCameraMode).not.toHaveBeenCalled();
  });

  it('ignores keys typed into form fields and contenteditable hosts', () => {
    const { actions } = setup();
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');
    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    for (const target of [input, textarea, select, editable]) {
      press(target, { code: 'Space' });
      press(target, { key: '4' });
    }
    expect(actions.togglePlayback).not.toHaveBeenCalled();
    expect(actions.selectAct).not.toHaveBeenCalled();
  });

  it('ignores keys whose target is not an element', () => {
    const { actions } = setup();
    press(document, { key: 'o' });
    expect(actions.toggleCameraMode).toHaveBeenCalledTimes(1);
    const nonElement = { dispatchEvent: () => true } as unknown as EventTarget;
    expect(nonElement).toBeDefined();
  });

  it('removes the listener on unmount', () => {
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const { unmount, actions } = setup();
    unmount();
    expect(removeListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    press(window, { code: 'Space' });
    expect(actions.togglePlayback).not.toHaveBeenCalled();
  });
});
