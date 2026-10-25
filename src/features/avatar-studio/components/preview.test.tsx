// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RgbaImage } from '@/shared/lib/raster';
import { makeStudio } from '../testing/studioFixtures';
import type { AvatarStudioState } from '../hooks/useAvatarStudio';
import { PreviewPane } from './PreviewPane';
import { PhotoCropper } from './PhotoCropper';
import { ShimmerCanvas } from './ShimmerCanvas';
import { AvatarStudioLauncher } from './AvatarStudioLauncher';
import { AvatarStudioModal } from './AvatarStudioModal';

const studio = vi.hoisted(() => ({ value: null as unknown as AvatarStudioState }));

vi.mock('../hooks/useAvatarStudio', () => ({ useAvatarStudio: () => studio.value }));

function image(fill = 120, size = 4): RgbaImage {
  const data = new Uint8ClampedArray(size * size * 4).fill(fill);
  return { width: size, height: size, data };
}


afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('ShimmerCanvas', () => {
  it('paints the first frame of a still', () => {
    render(<ShimmerCanvas frames={[image()]} label="Avatar preview" testId="shimmer__canvas" />);
    const canvas = screen.getByTestId('shimmer__canvas') as HTMLCanvasElement;
    expect(canvas.width).toBe(4);
    expect(canvas.getAttribute('aria-label')).toBe('Avatar preview');
    expect(canvas.getAttribute('role')).toBe('img');
  });

  it('ping-pongs through several frames on a timer', () => {
    vi.useFakeTimers();
    const frames = [image(10), image(20), image(30)];
    render(<ShimmerCanvas frames={frames} label="Avatar preview" testId="shimmer__canvas" frameMs={50} />);
    expect(vi.getTimerCount()).toBe(1);
    const canvas = screen.getByTestId('shimmer__canvas') as HTMLCanvasElement;
    const context = canvas.getContext('2d')!;
    const put = vi.spyOn(context, 'putImageData');
    fireEvent(canvas, new Event('noop'));
    vi.advanceTimersByTime(50);
    expect(put).toHaveBeenCalled();
    // The ping-pong walks back down through the same frames.
    vi.advanceTimersByTime(150);
    expect(put.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('holds still when frames are missing or motion is reduced', () => {
    vi.useFakeTimers();
    const empty = render(<ShimmerCanvas frames={[]} label="Empty" testId="shimmer__empty" />);
    expect(vi.getTimerCount()).toBe(0);
    empty.unmount();

    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    render(<ShimmerCanvas frames={[image(1), image(2)]} label="Reduced" testId="shimmer__reduced" />);
    expect(vi.getTimerCount()).toBe(0);

    // A browser without matchMedia at all still animates.
    delete (window as unknown as Record<string, unknown>).matchMedia;
    render(<ShimmerCanvas frames={[image(1), image(2)]} label="No media" testId="shimmer__nomedia" />);
    expect(vi.getTimerCount()).toBe(1);
    vi.runOnlyPendingTimers();
  });
});

describe('PreviewPane', () => {
  it('shows the preview canvas, the hint and the four source actions', () => {
    const state = makeStudio();
    render(<PreviewPane studio={state} />);
    expect(screen.getByTestId('avatar-studio__preview')).toBeDefined();
    expect(screen.getByTestId('avatar-studio__state').textContent).toContain('Choose a portrait');
    expect(screen.getByTestId('avatar-studio__adjust-framing')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('avatar-studio__download-png')).toHaveProperty('disabled', true);
  });

  it('prefers the session error, then the export error, for the status line', () => {
    const errored = render(
      <PreviewPane studio={makeStudio({ session: { ...makeStudio().session, error: 'Bad file.' } })} />,
    );
    const status = screen.getByTestId('avatar-studio__state');
    expect(status.textContent).toBe('Bad file.');
    expect(status.className).toContain('text-[#f3a6a0]');
    errored.unmount();

    render(<PreviewPane studio={makeStudio({ exportError: 'Export failed.' })} />);
    expect(screen.getByTestId('avatar-studio__state').textContent).toBe('Export failed.');
  });

  it('wires the file picker, the sample and the download', async () => {
    const base = makeStudio();
    const state = makeStudio({
      canDownload: true,
      session: { ...base.session, photo: image(30, 8), crop: { x: 0, y: 0, size: 8 } },
    });
    render(<PreviewPane studio={state} />);

    const input = screen.getByTestId('avatar-studio__file-input') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    await userEvent.click(screen.getByTestId('avatar-studio__choose-image'));
    expect(click).toHaveBeenCalledTimes(1);

    fireEvent.change(input, {
      target: { files: [new File([new Uint8Array([1])], 'daisy.png', { type: 'image/png' })] },
    });
    expect(state.session.loadFile).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('');

    await userEvent.click(screen.getByTestId('avatar-studio__sample-wei-ling'));
    expect(state.showWeiLing).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByTestId('avatar-studio__adjust-framing'));
    expect(state.session.startAdjusting).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByTestId('avatar-studio__download-png'));
    expect(state.downloadPng).toHaveBeenCalledTimes(1);
  });

  it('tolerates a cancelled file picker and shows the busy export label', async () => {
    const state = makeStudio({ canDownload: true, isExporting: true });
    render(<PreviewPane studio={state} />);
    fireEvent.change(screen.getByTestId('avatar-studio__file-input'), { target: { files: [] } });
    expect(state.session.loadFile).toHaveBeenCalledWith(null);
    expect(screen.getByTestId('avatar-studio__download-png').textContent).toContain('Preparing PNG');
  });

  it('shows the cropper while framing', () => {
    const photo = image(30, 8);
    const base = makeStudio();
    render(
      <PreviewPane
        studio={makeStudio({
          session: {
            ...base.session,
            photo,
            crop: { x: 0, y: 0, size: 8 },
            cropperStart: { x: 0, y: 0, size: 8 },
            isCropping: true,
          },
        })}
      />,
    );
    expect(screen.getByTestId('avatar-studio__crop-square')).toBeDefined();
    expect(screen.queryByTestId('avatar-studio__preview')).toBeNull();
  });
});

describe('PhotoCropper', () => {
  const photo = image(40, 40);

  it('confirms the current square and can be cancelled', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <PhotoCropper photo={photo} initial={{ x: 4, y: 4, size: 20 }} onConfirm={onConfirm} onCancel={onCancel} />,
    );
    await userEvent.click(screen.getByTestId('avatar-studio__crop-confirm'));
    expect(onConfirm).toHaveBeenCalledWith({ x: 4, y: 4, size: 20 });

    await userEvent.click(screen.getByTestId('avatar-studio__crop-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('moves the square with the keyboard and with a drag', () => {
    render(
      <PhotoCropper photo={photo} initial={{ x: 4, y: 4, size: 20 }} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    const square = screen.getByTestId('avatar-studio__crop-square');
    expect(square.style.left).toBe('10%');

    fireEvent.keyDown(square, { key: 'ArrowRight' });
    expect(square.style.left).toBe(`${((4 + 40 * 0.02) / 40) * 100}%`);

    const frame = square.parentElement!;
    frame.setPointerCapture = vi.fn();
    frame.getBoundingClientRect = () =>
      ({ width: 400, height: 400, top: 0, left: 0, x: 0, y: 0, right: 400, bottom: 400, toJSON: () => ({}) }) as DOMRect;

    fireEvent.pointerDown(square, { pointerId: 3, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(frame, { pointerId: 3, clientX: 20, clientY: 10 });
    expect(square.style.left).not.toBe('10%');
    fireEvent.pointerUp(frame, { pointerId: 3 });

    fireEvent.pointerDown(screen.getByTestId('avatar-studio__crop-handle'), { pointerId: 4, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(frame, { pointerId: 4, clientX: 30, clientY: 30 });
    fireEvent.pointerCancel(frame, { pointerId: 4 });
  });
});

describe('AvatarStudioModal', () => {
  it('renders nothing while closed', () => {
    render(<AvatarStudioModal open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the studio and closes', async () => {
    studio.value = makeStudio();
    const onClose = vi.fn();
    render(<AvatarStudioModal open onClose={onClose} />);
    expect(screen.getByText('GILDED AVATAR STUDIO')).toBeDefined();
    expect(screen.getByTestId('avatar-studio__overlay')).toBeDefined();
    await userEvent.click(screen.getByTestId('avatar-studio__close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('AvatarStudioLauncher', () => {
  it('opens and closes the studio', async () => {
    studio.value = makeStudio();
    render(<AvatarStudioLauncher className="host-class" />);
    const launcher = screen.getByTestId('avatar-studio__launch');
    expect(launcher.className).toContain('host-class');
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.click(launcher);
    expect(screen.getByRole('dialog')).toBeDefined();

    await userEvent.click(screen.getByTestId('avatar-studio__close'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('studio fixtures', () => {
  it('supplies inert async photo actions for component tests', async () => {
    const fixture = makeStudio();
    await expect(fixture.session.loadFile(null)).resolves.toBeUndefined();
    expect(fixture.session.loadFile).toHaveBeenCalledWith(null);
    await expect(
      fixture.session.loadSample({ id: 'wei-ling', name: 'Wei Ling', persona: 'Hawker auntie', src: 'data:,' }),
    ).resolves.toBeUndefined();
    expect(fixture.session.loadSample).toHaveBeenCalledTimes(1);
  });
});
