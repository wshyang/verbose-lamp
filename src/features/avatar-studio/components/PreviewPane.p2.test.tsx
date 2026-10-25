// @vitest-environment jsdom
// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { fireEvent, render, screen } from '@testing-library/react';

import userEvent from '@testing-library/user-event';

import { describe, expect, it, vi } from 'vitest';

import { PreviewPane } from './PreviewPane';

vi.mock('./PhotoCropper', () => ({ PhotoCropper: () => <div>Cropper mock</div> }));
vi.mock('./ShimmerCanvas', () => ({ ShimmerCanvas: () => <canvas aria-label="Shimmer mock" /> }));
function studio(overrides: Record<string, unknown> = {}, sessionOverrides: Record<string, unknown> = {}) {
  return {
    session: {
      isCropping: false, photo: { width: 1, height: 1, data: new Uint8ClampedArray(4) },
      cropperStart: { x: 0, y: 0, size: 1 }, confirmCrop: vi.fn(), cancelCrop: vi.fn(),
      error: null, hint: 'Helpful hint', loadFile: vi.fn(() => Promise.resolve()),
      startAdjusting: vi.fn(),
      ...sessionOverrides,
    },
    previewFrames: [], exportError: null, showWeiLing: vi.fn(),
    canDownload: true, isExporting: false, downloadPng: vi.fn(() => Promise.resolve()),
    ...overrides,
  } as never;
}
const fn = (value: never, key: string) =>
  (value as unknown as Record<string, ReturnType<typeof vi.fn>>)[key];
describe('PreviewPane', () => {
  it('shows the cropper only when cropping with a photo and starting box', () => {
    const { rerender } = render(<PreviewPane studio={studio()} />);
    expect(screen.getByTestId('avatar-studio__preview')).toBeTruthy();
    rerender(<PreviewPane studio={studio({}, { isCropping: true, photo: null })} />);
    expect(screen.queryByText('Cropper mock')).toBeNull();
    rerender(<PreviewPane studio={studio({}, { isCropping: true, cropperStart: null })} />);
    expect(screen.queryByText('Cropper mock')).toBeNull();
    rerender(<PreviewPane studio={studio({}, { isCropping: true })} />);
    expect(screen.getByText('Cropper mock')).toBeTruthy();
  });

  it('prioritises session error, then export error, then hint', () => {
    const { rerender } = render(<PreviewPane studio={studio({ exportError: 'Export bad' })} />);
    expect(screen.getByTestId('avatar-studio__state').textContent).toBe('Export bad');
    rerender(<PreviewPane studio={studio({}, { error: 'Session bad' })} />);
    expect(screen.getByTestId('avatar-studio__state').textContent).toBe('Session bad');
    rerender(<PreviewPane studio={studio()} />);
    expect(screen.getByTestId('avatar-studio__state').textContent).toBe('Helpful hint');
  });

  it('loads file choices and source actions, clearing the native input', async () => {
    const user = userEvent.setup();
    const current = studio();
    render(<PreviewPane studio={current} />);
    const input = screen.getByTestId('avatar-studio__file-input') as HTMLInputElement;
    const inputClick = vi.spyOn(input, 'click').mockImplementation(() => undefined);
    await user.click(screen.getByTestId('avatar-studio__choose-image'));
    expect(inputClick).toHaveBeenCalledOnce();
    fireEvent.change(input);
    expect(fn((current as unknown as { session: never }).session, 'loadFile')).toHaveBeenCalledWith(null);
    const photo = new File(['x'], 'x.jpg', { type: 'image/jpeg' });
    await user.upload(input, photo);
    expect(fn((current as unknown as { session: never }).session, 'loadFile')).toHaveBeenLastCalledWith(photo);
    expect(input.value).toBe('');
    await user.click(screen.getByTestId('avatar-studio__sample-wei-ling'));
    await user.click(screen.getByTestId('avatar-studio__adjust-framing'));
    await user.click(screen.getByTestId('avatar-studio__download-png'));
    expect(fn(current, 'showWeiLing')).toHaveBeenCalledOnce();
    expect(fn(current, 'downloadPng')).toHaveBeenCalledOnce();
  });

  it('covers every disabled and exporting source-action state', () => {
    const noPhoto = render(<PreviewPane studio={studio({ canDownload: false }, { photo: null })} />);
    expect((screen.getByTestId('avatar-studio__adjust-framing') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('avatar-studio__download-png') as HTMLButtonElement).disabled).toBe(true);
    noPhoto.unmount();

    const cropping = render(<PreviewPane studio={studio({}, { isCropping: true })} />);
    expect((screen.getByTestId('avatar-studio__adjust-framing') as HTMLButtonElement).disabled).toBe(true);
    cropping.unmount();

    render(<PreviewPane studio={studio({ isExporting: true })} />);
    const download = screen.getByTestId('avatar-studio__download-png') as HTMLButtonElement;
    expect(download.disabled).toBe(true);
    expect(download.textContent).toContain('Preparing PNG');
  });
});
