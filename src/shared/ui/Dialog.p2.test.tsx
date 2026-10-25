// @vitest-environment jsdom
// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Dialog } from './Dialog';

let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;
function flushFrame() {
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((callback) => callback(0));
}
beforeEach(() => {
  frames = new Map();
  nextFrame = 1;
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => frames.delete(id)));
});
afterEach(() => vi.unstubAllGlobals());
describe('Dialog', () => {
  it('renders nothing while closed', () => {
    render(
      <Dialog open={false} onClose={vi.fn()} labelledBy="title">
        <span>Hidden</span>
      </Dialog>
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(frames.size).toBe(0);
  });

  it('focuses a preferred control, traps every Tab direction, and closes on Escape/backdrop', () => {
    const onClose = vi.fn();
    const parentKey = vi.fn();
    const outside = document.createElement('button');
    document.body.append(outside);
    render(
      <div onKeyDown={parentKey}>
        <Dialog open onClose={onClose} labelledBy="title" testId="shared-dialog" className="panel">
          <h2 id="title">Title</h2>
          <button type="button" hidden>Hidden</button>
          <button type="button" aria-hidden="true">Aria hidden</button>
          <button type="button">First</button>
          <button type="button" data-autofocus="true">Preferred</button>
          <button type="button">Last</button>
        </Dialog>
      </div>
    );
    flushFrame();
    expect(document.activeElement).toBe(screen.getByText('Preferred'));
    const dialog = screen.getByRole('dialog');
    const first = screen.getByText('First');
    const last = screen.getByText('Last');

    first.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    screen.getByText('Preferred').focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByText('Preferred'));
    outside.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    outside.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(dialog, { key: 'Enter' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    expect(parentKey).not.toHaveBeenCalled();

    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId('shared-dialog'));
    expect(onClose).toHaveBeenCalledTimes(2);
    outside.remove();
  });

  it('honours closeOnBackdrop=false and focuses the first available control', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} labelledBy="t" testId="d" closeOnBackdrop={false} backdropClassName="custom-backdrop">
        <span id="t">Title</span>
        <button type="button">Only</button>
      </Dialog>
    );
    flushFrame();
    expect(document.activeElement).toBe(screen.getByText('Only'));
    fireEvent.click(screen.getByTestId('d'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('d').className).toBe('custom-backdrop');
  });

  it('restores connected focus but not disconnected focus, and tolerates RAF after unmount', () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    const first = render(
      <Dialog open onClose={vi.fn()} labelledBy="t"><span id="t">One</span></Dialog>
    );
    const staleCallback = [...frames.values()][0];
    first.unmount();
    expect(document.activeElement).toBe(outside);
    staleCallback(0);

    outside.focus();
    const second = render(
      <Dialog open onClose={vi.fn()} labelledBy="t"><span id="t">Two</span></Dialog>
    );
    outside.remove();
    second.unmount();
    expect(document.activeElement).not.toBe(outside);
  });
});
