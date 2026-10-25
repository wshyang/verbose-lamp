// @vitest-environment jsdom
// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { fireEvent, render, screen } from '@testing-library/react';

import userEvent from '@testing-library/user-event';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GildedPortraitModal } from './GildedPortraitModal';

import { GILDING_PRESETS } from './presets';

const SOURCE = { width: 2, height: 2, data: new Uint8ClampedArray(16) };
const GILDED = { width: 2, height: 2, data: new Uint8ClampedArray(16).fill(2) };
const mocks = vi.hoisted(() => ({
  portrait: undefined as never,
  canvasProps: [] as Array<Record<string, unknown>>,
}));
vi.mock('./useGildedPortrait', () => ({ useGildedPortrait: () => mocks.portrait }));
vi.mock('./GildedPortraitCanvas', () => ({
  GildedPortraitCanvas: (props: Record<string, unknown>) => {
    mocks.canvasProps.push(props);
    return <canvas aria-label={props.label as string} data-testid="gilded-portrait__preview" />;
  },
}));
function fixture(overrides: Record<string, unknown> = {}) {
  return {
    sourceImage: SOURCE, gildedImage: GILDED, sourceName: 'sitter.jpg',
    params: GILDING_PRESETS[0].params, activePresetId: GILDING_PRESETS[0].id,
    error: null, isLoading: false, isExporting: false, isShimmering: true, isShowingOriginal: false,
    loadFile: vi.fn(() => Promise.resolve()), applyPreset: vi.fn(), setClarity: vi.fn(),
    setLevels: vi.fn(), setFolds: vi.fn(), setRamp: vi.fn(), setMaskShape: vi.fn(),
    setShimmering: vi.fn(), setShowingOriginal: vi.fn(), downloadPng: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}
const fn = (key: string) => (mocks.portrait as unknown as Record<string, ReturnType<typeof vi.fn>>)[key];
beforeEach(() => {
  mocks.portrait = fixture() as never;
  mocks.canvasProps = [];
});
describe('GildedPortraitModal', () => {
  it('forwards all controls and file actions', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<GildedPortraitModal open onClose={onClose} />);
    const input = screen.getByTestId('gilded-portrait__file-input') as HTMLInputElement;
    vi.spyOn(input, 'click').mockImplementation(() => undefined);
    await user.click(screen.getByTestId('gilded-portrait__choose-image'));
    fireEvent.change(input);
    const file = new File(['x'], 'new.jpg', { type: 'image/jpeg' });
    await user.upload(input, file);
    await user.click(screen.getByTestId('gilded-portrait__compare'));
    await user.click(screen.getAllByTestId('gilded-portrait__preset')[1]);
    fireEvent.change(screen.getByTestId('gilded-portrait__clarity'), { target: { value: '120' } });
    fireEvent.change(screen.getByTestId('gilded-portrait__levels'), { target: { value: '40' } });
    fireEvent.change(screen.getByTestId('gilded-portrait__folds'), { target: { value: '3' } });
    await user.click(screen.getAllByTestId('gilded-portrait__ramp')[1]);
    await user.click(screen.getAllByTestId('gilded-portrait__mask')[1]);
    await user.click(screen.getByTestId('gilded-portrait__shimmer'));
    await user.click(screen.getByTestId('gilded-portrait__download-png'));
    await user.click(screen.getByTestId('gilded-portrait__close'));

    expect(fn('loadFile')).toHaveBeenCalledWith(null);
    expect(fn('loadFile')).toHaveBeenCalledWith(file);
    expect(input.value).toBe('');
    expect(fn('setShowingOriginal')).toHaveBeenCalledWith(true);
    expect(fn('setClarity')).toHaveBeenCalledWith(1.2);
    expect(fn('setLevels')).toHaveBeenCalledWith(40);
    expect(fn('setFolds')).toHaveBeenCalledWith(3);
    expect(fn('setMaskShape')).toHaveBeenCalledWith('oval');
    expect(fn('setShimmering')).toHaveBeenCalledWith(false);
    expect(fn('downloadPng')).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByText('sitter.jpg')).toBeTruthy();
  });

  it('shows original without sheen and toggles back', async () => {
    const user = userEvent.setup();
    mocks.portrait = fixture({ isShowingOriginal: true, isShimmering: true }) as never;
    render(<GildedPortraitModal open onClose={vi.fn()} />);
    expect(mocks.canvasProps.at(-1)).toMatchObject({ image: SOURCE, label: 'Original image preview', isShimmering: false });
    expect(screen.getByTestId('gilded-portrait__compare').textContent).toContain('View gold');
    await user.click(screen.getByTestId('gilded-portrait__compare'));
    expect(fn('setShowingOriginal')).toHaveBeenCalledWith(false);
    expect(fn('setShimmering')).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('gilded-portrait__shimmer'));
    expect(fn('setShimmering')).toHaveBeenCalledWith(false);
  });

  it('shows gilded still when shimmering is false', () => {
    mocks.portrait = fixture({ isShimmering: false, sourceName: '' }) as never;
    render(<GildedPortraitModal open onClose={vi.fn()} />);
    expect(mocks.canvasProps.at(-1)).toMatchObject({ image: GILDED, isShimmering: false });
    expect(screen.queryByText('sitter.jpg')).toBeNull();
  });

  it('renders empty, loading, error, and disabled states', () => {
    mocks.portrait = fixture({
      sourceImage: null, gildedImage: null, sourceName: '', isLoading: true, error: 'Bad file', activePresetId: null,
    }) as never;
    const { rerender } = render(<GildedPortraitModal open onClose={vi.fn()} />);
    expect(screen.getByText(/Bring a photograph/)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Preparing image');
    expect(screen.getByTestId('gilded-portrait__error').textContent).toBe('Bad file');
    expect((screen.getByTestId('gilded-portrait__compare') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('gilded-portrait__download-png') as HTMLButtonElement).disabled).toBe(true);

    mocks.portrait = fixture({ isExporting: true }) as never;
    rerender(<GildedPortraitModal open onClose={vi.fn()} />);
    const download = screen.getByTestId('gilded-portrait__download-png') as HTMLButtonElement;
    expect(download.disabled).toBe(true);
    expect(download.textContent).toContain('Preparing PNG');
  });
});
