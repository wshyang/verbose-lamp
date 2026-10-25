// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { fireEvent, render, screen } from '@testing-library/react';

import { describe, expect, it, vi, beforeEach } from 'vitest';

import { PreviewPane } from './PreviewPane';

import { setupDomTests } from '@/test/dom';

import { installCanvas2d } from '@/test/canvas2d';

import { type AvatarStudioState } from '../hooks/useAvatarStudio';

setupDomTests();
const raster = (width = 4, height = 4) => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4).fill(120),
});
const session = (overrides: Record<string, unknown> = {}) => ({
  photo: null,
  crop: null,
  cropperStart: null,
  isCropping: false,
  error: null,
  hint: 'Choose a portrait, or try Wei_Ling.',
  loadFile: vi.fn(),
  confirmCrop: vi.fn(),
  cancelCrop: vi.fn(),
  startAdjusting: vi.fn(),
  ...overrides,
});
const studio_p6 = (overrides: Record<string, unknown> = {}): AvatarStudioState =>
  ({
    previewFrames: [raster()],
    canDownload: false,
    isExporting: false,
    exportError: null,
    downloadPng: vi.fn(),
    showWeiLing: vi.fn(),
    ...overrides,
    session: session(overrides.session as Record<string, unknown> | undefined),
  }) as unknown as AvatarStudioState;
beforeEach(() => {
  installCanvas2d();
});
describe('PreviewPane', () => {
  it('shows the composed avatar with the session hint', () => {
    const value = studio_p6();
    render(<PreviewPane studio={value} />);

    expect(screen.getByTestId('avatar-studio__preview-canvas')).toBeTruthy();
    expect(screen.getByTestId('avatar-studio__state').textContent).toBe(value.session.hint);
  });

  it('prefers the session error over the export error over the hint', () => {
    const sessionError = studio_p6({
      session: { error: 'That image could not be opened.' },
      exportError: 'The PNG could not be prepared.',
    });
    const view = render(<PreviewPane studio={sessionError} />);
    expect(screen.getByTestId('avatar-studio__state').textContent).toBe(
      'That image could not be opened.'
    );
    view.unmount();

    const exportError = studio_p6({ exportError: 'The PNG could not be prepared.' });
    render(<PreviewPane studio={exportError} />);
    expect(screen.getByTestId('avatar-studio__state').textContent).toBe(
      'The PNG could not be prepared.'
    );
  });

  it('hands the preview over to the cropper while framing', () => {
    const value = studio_p6({
      session: { photo: raster(), cropperStart: { x: 0, y: 0, size: 3 }, isCropping: true },
    });
    render(<PreviewPane studio={value} />);

    expect(screen.getByTestId('avatar-studio__crop-square')).toBeTruthy();
    expect(screen.queryByTestId('avatar-studio__preview-canvas')).toBeNull();
  });

  it('confirms and cancels the framing', () => {
    const value = studio_p6({
      session: { photo: raster(), cropperStart: { x: 0, y: 0, size: 3 }, isCropping: true },
    });
    render(<PreviewPane studio={value} />);

    fireEvent.click(screen.getByTestId('avatar-studio__crop-confirm'));
    expect(value.session.confirmCrop).toHaveBeenCalledWith({ x: 0, y: 0, size: 3 });

    fireEvent.click(screen.getByTestId('avatar-studio__crop-cancel'));
    expect(value.session.cancelCrop).toHaveBeenCalledTimes(1);
  });

  it('loads the chosen file and clears the input', () => {
    const value = studio_p6();
    render(<PreviewPane studio={value} />);
    const input = screen.getByTestId('avatar-studio__file-input') as HTMLInputElement;
    const file = new File(['x'], 'me.png', { type: 'image/png' });

    fireEvent.change(input, { target: { files: [file] } });

    expect(value.session.loadFile).toHaveBeenCalledWith(file);
    expect(input.value).toBe('');
  });

  it('offers the sample portrait and the framing button', () => {
    const value = studio_p6();
    render(<PreviewPane studio={value} />);

    fireEvent.click(screen.getByTestId('avatar-studio__sample-wei-ling'));
    expect(value.showWeiLing).toHaveBeenCalledTimes(1);

    const adjust = screen.getByTestId('avatar-studio__adjust-framing') as HTMLButtonElement;
    expect(adjust.disabled).toBe(true);
    fireEvent.click(adjust);
    expect(value.session.startAdjusting).not.toHaveBeenCalled();
  });

  it('enables framing once a photo exists', () => {
    const value = studio_p6({ session: { photo: raster() } });
    render(<PreviewPane studio={value} />);

    fireEvent.click(screen.getByTestId('avatar-studio__adjust-framing'));

    expect(value.session.startAdjusting).toHaveBeenCalledTimes(1);
  });

  it('downloads only when the avatar is finished', () => {
    const blocked = studio_p6();
    const view = render(<PreviewPane studio={blocked} />);
    fireEvent.click(screen.getByTestId('avatar-studio__download-png'));
    expect(blocked.downloadPng).not.toHaveBeenCalled();
    view.unmount();

    const ready = studio_p6({ canDownload: true });
    render(<PreviewPane studio={ready} />);
    fireEvent.click(screen.getByTestId('avatar-studio__download-png'));
    expect(ready.downloadPng).toHaveBeenCalledTimes(1);
  });

  it('reports an export in progress', () => {
    const value = studio_p6({ canDownload: true, isExporting: true });
    render(<PreviewPane studio={value} />);

    const button = screen.getByTestId('avatar-studio__download-png') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Preparing PNG');
  });

  it('tells the visitor where the photo goes', () => {
    render(<PreviewPane studio={studio_p6()} />);

    expect(screen.getByText(/Your photo stays in this browser/)).toBeTruthy();
  });
});
