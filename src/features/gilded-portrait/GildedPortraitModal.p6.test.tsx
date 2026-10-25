// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { fireEvent, render, screen } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GildedPortraitModal } from './GildedPortraitModal';

import { GILDING_PRESETS } from './presets';

import { setupDomTests } from '@/test/dom';

import { installCanvas2d } from '@/test/canvas2d';

import { GOLD_RAMPS } from '@/shared/lib/goldRamp';

setupDomTests();
/**
 * The modal is presentation: the hook owns the gilding state. It is doubled so the
 * test can drive every branch (empty, loading, error, exporting, compare) directly.
 */
const state = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('./useGildedPortrait', () => ({ useGildedPortrait: () => state.current }));
const image = (value: number) => ({
  width: 2,
  height: 2,
  data: new Uint8ClampedArray(2 * 2 * 4).fill(value),
});
const portrait = (overrides: Record<string, unknown> = {}) => ({
  sourceImage: null,
  gildedImage: null,
  sourceName: '',
  params: GILDING_PRESETS[0].params,
  activePresetId: GILDING_PRESETS[0].id,
  error: null,
  isLoading: false,
  isExporting: false,
  isShimmering: true,
  isShowingOriginal: false,
  loadFile: vi.fn(),
  applyPreset: vi.fn(),
  setClarity: vi.fn(),
  setLevels: vi.fn(),
  setFolds: vi.fn(),
  setRamp: vi.fn(),
  setMaskShape: vi.fn(),
  setShimmering: vi.fn(),
  setShowingOriginal: vi.fn(),
  downloadPng: vi.fn(),
  ...overrides,
});
beforeEach(() => {
  installCanvas2d();
  state.current = portrait();
});
const mount = (open = true, onClose = vi.fn()) => ({
  onClose,
  ...render(<GildedPortraitModal open={open} onClose={onClose} />),
});
describe('GildedPortraitModal', () => {
  it('renders nothing while closed', () => {
    const { container } = mount(false);

    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('gilded-portrait__backdrop')).toBeNull();
  });

  it('invites a photograph when nothing is loaded', () => {
    mount();

    expect(screen.getByText('Bring a photograph or object into the light.')).toBeTruthy();
    expect(screen.getByText('JPEG · PNG · WEBP · up to 25 MB')).toBeTruthy();
    expect(screen.getByText('GILDED PORTRAIT')).toBeTruthy();
    expect(screen.queryByTestId('gilded-portrait__preview')).toBeNull();
  });

  it('previews the gilded image and offers the original for comparison', () => {
    state.current = portrait({
      sourceImage: image(10),
      gildedImage: image(20),
      sourceName: 'gala.png',
    });
    mount();

    expect(screen.getByLabelText('Gilded image preview')).toBeTruthy();
    expect(screen.getByText('gala.png')).toBeTruthy();

    fireEvent.click(screen.getByTestId('gilded-portrait__compare'));
    expect(state.current.setShowingOriginal).toHaveBeenCalledWith(true);
  });

  it('labels the comparison view and its button from the current side', () => {
    state.current = portrait({ sourceImage: image(1), gildedImage: image(2), isShowingOriginal: true });
    mount();

    expect(screen.getByLabelText('Original image preview')).toBeTruthy();
    expect(screen.getByTestId('gilded-portrait__compare').textContent).toContain('View gold');

    fireEvent.click(screen.getByTestId('gilded-portrait__compare'));
    expect(state.current.setShowingOriginal).toHaveBeenCalledWith(false);
  });

  it('disables comparison until there is a source image', () => {
    mount();

    expect((screen.getByTestId('gilded-portrait__compare') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows a busy overlay while the image is being prepared', () => {
    state.current = portrait({ isLoading: true });
    mount();

    expect(screen.getByText('Preparing image')).toBeTruthy();
  });

  it('surfaces an error in an alert', () => {
    state.current = portrait({ error: 'That image could not be opened.' });
    mount();

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('That image could not be opened.');
    expect(alert.getAttribute('data-testid')).toBe('gilded-portrait__error');
  });

  it('loads the file chosen through the hidden input', () => {
    mount();
    const input = screen.getByTestId('gilded-portrait__file-input') as HTMLInputElement;
    const file = new File(['x'], 'me.png', { type: 'image/png' });

    fireEvent.change(input, { target: { files: [file] } });

    expect(state.current.loadFile).toHaveBeenCalledWith(file);
  });

  it('forwards the tone sliders in display units', () => {
    state.current = portrait({
      params: { ...GILDING_PRESETS[0].params, clarity: 1.2, levels: 60, folds: 2 },
    });
    mount();

    expect(screen.getByText('120%')).toBeTruthy();

    fireEvent.change(screen.getByTestId('gilded-portrait__clarity'), { target: { value: '80' } });
    expect(state.current.setClarity).toHaveBeenCalledWith(0.8);

    fireEvent.change(screen.getByTestId('gilded-portrait__levels'), { target: { value: '35' } });
    expect(state.current.setLevels).toHaveBeenCalledWith(35);

    fireEvent.change(screen.getByTestId('gilded-portrait__folds'), { target: { value: '3' } });
    expect(state.current.setFolds).toHaveBeenCalledWith(3);
  });

  it('applies a finish preset and marks the active one', () => {
    mount();

    const presets = screen.getAllByTestId('gilded-portrait__preset');
    expect(presets).toHaveLength(GILDING_PRESETS.length);
    expect(presets[0].getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(presets[1]);
    expect(state.current.applyPreset).toHaveBeenCalledWith(GILDING_PRESETS[1]);
  });

  it('swaps the gold ramp', () => {
    mount();

    const ramps = screen.getAllByTestId('gilded-portrait__ramp');
    expect(ramps).toHaveLength(Object.values(GOLD_RAMPS).length);

    fireEvent.click(ramps[1]);
    expect(state.current.setRamp).toHaveBeenCalledWith(Object.values(GOLD_RAMPS)[1].id);
  });

  it('swaps the silhouette mask', () => {
    mount();

    const masks = screen.getAllByTestId('gilded-portrait__mask');
    expect(masks.map((chip) => chip.textContent)).toEqual(['Full frame', 'Oval', 'Rounded']);
    expect(masks[0].getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(masks[1]);
    expect(state.current.setMaskShape).toHaveBeenCalledWith('oval');
  });

  it('toggles the sheen', () => {
    mount();

    fireEvent.click(screen.getByTestId('gilded-portrait__shimmer'));
    expect(state.current.setShimmering).toHaveBeenCalledWith(false);
  });

  it('enables the download only once there is a gilded image', () => {
    const empty = mount();
    expect((screen.getByTestId('gilded-portrait__download-png') as HTMLButtonElement).disabled).toBe(true);
    empty.unmount();

    state.current = portrait({ gildedImage: image(3) });
    mount();

    const button = screen.getByTestId('gilded-portrait__download-png') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(state.current.downloadPng).toHaveBeenCalledTimes(1);
  });

  it('reports an export in progress', () => {
    state.current = portrait({ gildedImage: image(3), isExporting: true });
    mount();

    const button = screen.getByTestId('gilded-portrait__download-png') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Preparing PNG');
  });
});
