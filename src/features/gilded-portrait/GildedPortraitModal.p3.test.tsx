// @vitest-environment jsdom
// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import userEvent from '@testing-library/user-event';

import { describe, expect, it, vi, afterEach } from 'vitest';

import { GildedPortraitModal } from './GildedPortraitModal';

import { GILDING_PRESETS } from './presets';

import { type RgbaImage } from './types';

import { buildStudioPortraitFixture } from './fixtures';

const io = vi.hoisted(() => ({ loadRgbaImage: vi.fn(), downloadGildedPng: vi.fn() }));
vi.mock('./load', () => ({ loadRgbaImage: io.loadRgbaImage }));
vi.mock('./export', () => ({ downloadGildedPng: io.downloadGildedPng }));
const snapshot = buildStudioPortraitFixture();
function portraitFile(name = 'daisy.png') {
  return new File([new Uint8Array([4, 5, 6])], name, { type: 'image/png' });
}
async function openWithImage() {
  io.loadRgbaImage.mockResolvedValue(snapshot);
  const onClose = vi.fn();
  render(<GildedPortraitModal open onClose={onClose} />);
  const input = screen.getByTestId('gilded-portrait__file-input');
  fireEvent.change(input, { target: { files: [portraitFile('daisy.png')] } });
  await waitFor(() => expect(screen.getByTestId('gilded-portrait__preview')).toBeDefined());
  return { onClose };
}
afterEach(() => {
  vi.clearAllMocks();
});
describe('GildedPortraitModal', () => {
  it('renders nothing while closed', () => {
    render(<GildedPortraitModal open={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId('gilded-portrait__backdrop')).toBeNull();
  });

  it('shows the empty state and the full control set when open', () => {
    render(<GildedPortraitModal open onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('GILDED PORTRAIT')).toBeDefined();
    expect(screen.getByText('Bring a photograph or object into the light.')).toBeDefined();
    expect(screen.getAllByTestId('gilded-portrait__preset')).toHaveLength(GILDING_PRESETS.length);
    expect(screen.getAllByTestId('gilded-portrait__ramp')).toHaveLength(3);
    expect(screen.getAllByTestId('gilded-portrait__mask')).toHaveLength(3);
    expect(screen.queryByTestId('gilded-portrait__preview')).toBeNull();
    expect(screen.getByTestId('gilded-portrait__compare')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('gilded-portrait__download-png')).toHaveProperty('disabled', true);
  });

  it('clears the native input value so the same file can be chosen twice', async () => {
    io.loadRgbaImage.mockResolvedValue(snapshot);
    render(<GildedPortraitModal open onClose={vi.fn()} />);
    const input = screen.getByTestId('gilded-portrait__file-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [portraitFile()] } });
    await waitFor(() => expect(io.loadRgbaImage).toHaveBeenCalledTimes(1));
    expect(input.value).toBe('');
  });

  it('tolerates a cancelled file picker', async () => {
    render(<GildedPortraitModal open onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('gilded-portrait__file-input'), { target: { files: [] } });
    expect(io.loadRgbaImage).not.toHaveBeenCalled();
    expect(screen.getByText('Bring a photograph or object into the light.')).toBeDefined();
  });

  it('opens the file picker from the Choose image button', async () => {
    render(<GildedPortraitModal open onClose={vi.fn()} />);
    const input = screen.getByTestId('gilded-portrait__file-input') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    await userEvent.click(screen.getByTestId('gilded-portrait__choose-image'));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('renders the gilded preview, compares with the original and toggles the sheen', async () => {
    await openWithImage();
    const preview = screen.getByTestId('gilded-portrait__preview');
    expect(preview.getAttribute('aria-label')).toBe('Gilded image preview');
    expect(document.querySelector('.gilded-portrait-sheen')).not.toBeNull();
    expect(screen.getByText('daisy.png')).toBeDefined();

    const compare = screen.getByTestId('gilded-portrait__compare');
    await userEvent.click(compare);
    expect(screen.getByTestId('gilded-portrait__preview').getAttribute('aria-label')).toBe(
      'Original image preview',
    );
    expect(compare.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('.gilded-portrait-sheen')).toBeNull();
    expect(within(screen.getByRole('dialog')).getByText('View gold')).toBeDefined();

    await userEvent.click(compare);
    expect(screen.getByTestId('gilded-portrait__preview').getAttribute('aria-label')).toBe(
      'Gilded image preview',
    );

    await userEvent.click(screen.getByTestId('gilded-portrait__shimmer'));
    expect(document.querySelector('.gilded-portrait-sheen')).toBeNull();
    await userEvent.click(screen.getByTestId('gilded-portrait__shimmer'));
    expect(document.querySelector('.gilded-portrait-sheen')).not.toBeNull();
  });

  it('picks presets, gold tones and silhouettes', async () => {
    render(<GildedPortraitModal open onClose={vi.fn()} />);
    const presets = screen.getAllByTestId('gilded-portrait__preset');
    expect(presets[0].getAttribute('aria-pressed')).toBe('true');

    await userEvent.click(presets[1]);
    expect(screen.getAllByTestId('gilded-portrait__preset')[1].getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByTestId('gilded-portrait__preset')[0].getAttribute('aria-pressed')).toBe('false');

    const ramp = screen.getAllByTestId('gilded-portrait__ramp')[1];
    await userEvent.click(ramp);
    expect(ramp.getAttribute('aria-pressed')).toBe('true');

    const oval = screen.getAllByTestId('gilded-portrait__mask')[1];
    await userEvent.click(oval);
    expect(oval.getAttribute('aria-pressed')).toBe('true');
  });

  it('drives the clarity, levels and folds sliders', () => {
    render(<GildedPortraitModal open onClose={vi.fn()} />);
    const clarity = screen.getByTestId('gilded-portrait__clarity') as HTMLInputElement;
    expect(clarity.value).toBe('85');
    fireEvent.change(clarity, { target: { value: '120' } });
    expect(screen.getByText('120%')).toBeDefined();

    const levels = screen.getByTestId('gilded-portrait__levels') as HTMLInputElement;
    fireEvent.change(levels, { target: { value: '40' } });
    expect(levels.value).toBe('40');

    const folds = screen.getByTestId('gilded-portrait__folds') as HTMLInputElement;
    fireEvent.change(folds, { target: { value: '3' } });
    expect(folds.value).toBe('3');
    expect(screen.getByText('Specular folds')).toBeDefined();
  });

  it('shows an error alert for a rejected file', async () => {
    render(<GildedPortraitModal open onClose={vi.fn()} />);
    const bad = new File(['x'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByTestId('gilded-portrait__file-input'), { target: { files: [bad] } });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/PNG|JPEG|WebP|supported/i);
    expect(alert.getAttribute('data-testid')).toBe('gilded-portrait__error');
  });

  it('shows a busy overlay while the image is being prepared', async () => {
    let resolve: (image: RgbaImage) => void = () => {};
    io.loadRgbaImage.mockImplementation(() => new Promise<RgbaImage>((done) => { resolve = done; }));
    render(<GildedPortraitModal open onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('gilded-portrait__file-input'), {
      target: { files: [portraitFile()] },
    });
    expect(await screen.findByText('Preparing image')).toBeDefined();
    resolve(snapshot);
    await waitFor(() => expect(screen.queryByText('Preparing image')).toBeNull());
  });

  it('downloads the finished PNG', async () => {
    io.downloadGildedPng.mockResolvedValue(undefined);
    await openWithImage();
    await userEvent.click(screen.getByTestId('gilded-portrait__download-png'));
    expect(io.downloadGildedPng).toHaveBeenCalledWith(expect.objectContaining({ width: snapshot.width }), 'daisy.png');
  });
});
