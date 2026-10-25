// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { setupDomTests } from '@/test/dom';
import { installCanvas2d } from '@/test/canvas2d';
import type { AvatarStudioState } from '../hooks/useAvatarStudio';
import { PreviewPane } from './PreviewPane';

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

const studio = (overrides: Record<string, unknown> = {}): AvatarStudioState =>
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
    const value = studio();
    render(<PreviewPane studio={value} />);

    expect(screen.getByTestId('avatar-studio__preview-canvas')).toBeTruthy();
    expect(screen.getByTestId('avatar-studio__state').textContent).toBe(value.session.hint);
  });

  it('prefers the session error over the export error over the hint', () => {
    const sessionError = studio({
      session: { error: 'That image could not be opened.' },
      exportError: 'The PNG could not be prepared.',
    });
    const view = render(<PreviewPane studio={sessionError} />);
    expect(screen.getByTestId('avatar-studio__state').textContent).toBe(
      'That image could not be opened.'
    );
    view.unmount();

    const exportError = studio({ exportError: 'The PNG could not be prepared.' });
    render(<PreviewPane studio={exportError} />);
    expect(screen.getByTestId('avatar-studio__state').textContent).toBe(
      'The PNG could not be prepared.'
    );
  });

  it('hands the preview over to the cropper while framing', () => {
    const value = studio({
      session: { photo: raster(), cropperStart: { x: 0, y: 0, size: 3 }, isCropping: true },
    });
    render(<PreviewPane studio={value} />);

    expect(screen.getByTestId('avatar-studio__crop-square')).toBeTruthy();
    expect(screen.queryByTestId('avatar-studio__preview-canvas')).toBeNull();
  });

  it('confirms and cancels the framing', () => {
    const value = studio({
      session: { photo: raster(), cropperStart: { x: 0, y: 0, size: 3 }, isCropping: true },
    });
    render(<PreviewPane studio={value} />);

    fireEvent.click(screen.getByTestId('avatar-studio__crop-confirm'));
    expect(value.session.confirmCrop).toHaveBeenCalledWith({ x: 0, y: 0, size: 3 });

    fireEvent.click(screen.getByTestId('avatar-studio__crop-cancel'));
    expect(value.session.cancelCrop).toHaveBeenCalledTimes(1);
  });

  it('loads the chosen file and clears the input', () => {
    const value = studio();
    render(<PreviewPane studio={value} />);
    const input = screen.getByTestId('avatar-studio__file-input') as HTMLInputElement;
    const file = new File(['x'], 'me.png', { type: 'image/png' });

    fireEvent.change(input, { target: { files: [file] } });

    expect(value.session.loadFile).toHaveBeenCalledWith(file);
    expect(input.value).toBe('');
  });

  it('offers the sample portrait and the framing button', () => {
    const value = studio();
    render(<PreviewPane studio={value} />);

    fireEvent.click(screen.getByTestId('avatar-studio__sample-wei-ling'));
    expect(value.showWeiLing).toHaveBeenCalledTimes(1);

    const adjust = screen.getByTestId('avatar-studio__adjust-framing') as HTMLButtonElement;
    expect(adjust.disabled).toBe(true);
    fireEvent.click(adjust);
    expect(value.session.startAdjusting).not.toHaveBeenCalled();
  });

  it('enables framing once a photo exists', () => {
    const value = studio({ session: { photo: raster() } });
    render(<PreviewPane studio={value} />);

    fireEvent.click(screen.getByTestId('avatar-studio__adjust-framing'));

    expect(value.session.startAdjusting).toHaveBeenCalledTimes(1);
  });

  it('downloads only when the avatar is finished', () => {
    const blocked = studio();
    const view = render(<PreviewPane studio={blocked} />);
    fireEvent.click(screen.getByTestId('avatar-studio__download-png'));
    expect(blocked.downloadPng).not.toHaveBeenCalled();
    view.unmount();

    const ready = studio({ canDownload: true });
    render(<PreviewPane studio={ready} />);
    fireEvent.click(screen.getByTestId('avatar-studio__download-png'));
    expect(ready.downloadPng).toHaveBeenCalledTimes(1);
  });

  it('reports an export in progress', () => {
    const value = studio({ canDownload: true, isExporting: true });
    render(<PreviewPane studio={value} />);

    const button = screen.getByTestId('avatar-studio__download-png') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Preparing PNG');
  });

  it('tells the visitor where the photo goes', () => {
    render(<PreviewPane studio={studio()} />);

    expect(screen.getByText(/Your photo stays in this browser/)).toBeTruthy();
  });
});
