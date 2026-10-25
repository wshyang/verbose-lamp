// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PhotoCropper } from './PhotoCropper';

vi.mock('@/features/gilded-portrait', () => ({
  GildedPortraitCanvas: () => <canvas aria-label="Photo mock" />,
}));

const PHOTO = { width: 100, height: 80, data: new Uint8ClampedArray(4) };

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 50, height: 40, x: 0, y: 0, top: 0, left: 0, right: 50, bottom: 40,
    toJSON: () => ({}),
  });
});

describe('PhotoCropper', () => {
  it('moves and resizes with pointers, handles up/cancel, then confirms or cancels', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <PhotoCropper photo={PHOTO} initial={{ x: 10, y: 10, size: 40 }} onConfirm={onConfirm} onCancel={onCancel} />
    );
    const square = screen.getByTestId('avatar-studio__crop-square');
    const frame = square.parentElement!;
    fireEvent.pointerDown(square, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(frame, { clientX: 5, clientY: 5 });
    fireEvent.pointerUp(frame);
    fireEvent.pointerDown(screen.getByTestId('avatar-studio__crop-handle'), {
      pointerId: 2, clientX: 0, clientY: 0,
    });
    fireEvent.pointerMove(frame, { clientX: 5, clientY: 0 });
    fireEvent.pointerCancel(frame);
    fireEvent.keyDown(square, { key: 'ArrowRight' });
    await user.click(screen.getByTestId('avatar-studio__crop-confirm'));
    expect(onConfirm).toHaveBeenCalledWith({ x: 21.6, y: 20, size: 50 });
    await user.click(screen.getByTestId('avatar-studio__crop-cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(frame.style.aspectRatio).toBe('100 / 80');
  });
});
