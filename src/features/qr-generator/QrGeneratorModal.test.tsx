// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setupDomTests } from '@/test/dom';

const downloads = vi.hoisted(() => ({
  downloadSvgElement: vi.fn(),
  downloadSvgAsPng: vi.fn(),
}));

vi.mock('./export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./export')>()),
  ...downloads,
}));

import {
  MAX_QR_CAPTION_LENGTH,
  QR_ERROR_CORRECTION_OPTIONS,
  QR_PRESETS,
  QR_SHAPE_OPTIONS,
} from './presets';
import { QrGeneratorModal } from './QrGeneratorModal';

setupDomTests();

const renderModal = () => {
  const onClose = vi.fn();
  const view = render(<QrGeneratorModal open onClose={onClose} />);
  return { onClose, view };
};

const typeInscription = (value: string) =>
  fireEvent.change(screen.getByTestId('qr-generator__input'), { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('QrGeneratorModal', () => {
  it('renders nothing while closed', () => {
    render(<QrGeneratorModal open={false} onClose={vi.fn()} />);

    expect(screen.queryByTestId('qr-generator__backdrop')).toBeNull();
  });

  it('opens on the West Egg preset with its summary', () => {
    renderModal();

    expect(screen.getByTestId('qr-generator__backdrop')).toBeTruthy();
    expect(screen.getByText('GOLDEN QR GENERATOR')).toBeTruthy();
    const presets = screen.getAllByTestId('qr-generator__preset');
    expect(presets).toHaveLength(QR_PRESETS.length);
    expect(presets[0].getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByTestId('qr-generator__input') as HTMLTextAreaElement).value).toBe(
      QR_PRESETS[0].text
    );
    expect(screen.getByTestId('qr-generator__summary').textContent).toMatch(
      /^Version \d+ · \d+×\d+ modules · \d+ bytes$/
    );
    expect(screen.getByTestId('qr-generator__preview')).toBeTruthy();
  });

  it('swaps the inscription, caption and level from a preset', () => {
    renderModal();
    const preset = QR_PRESETS[2];

    fireEvent.click(screen.getAllByTestId('qr-generator__preset')[2]);

    expect((screen.getByTestId('qr-generator__input') as HTMLTextAreaElement).value).toBe(
      preset.text
    );
    expect((screen.getByTestId('qr-generator__caption') as HTMLInputElement).value).toBe(
      preset.caption
    );
    const chips = screen.getAllByTestId('qr-generator__ec-level');
    const active = chips.find((chip) => chip.getAttribute('aria-pressed') === 'true');
    expect(active?.textContent).toContain(preset.errorCorrection);
  });

  it('keeps the caption inside its limit', () => {
    renderModal();
    const input = screen.getByTestId('qr-generator__caption') as HTMLInputElement;

    expect(input.maxLength).toBe(MAX_QR_CAPTION_LENGTH);
    fireEvent.change(input, { target: { value: 'A CAPTION' } });

    expect(input.value).toBe('A CAPTION');
    expect(screen.getByTestId('qr-generator__preview').getAttribute('aria-label')).toBe(
      'Golden QR code: A CAPTION'
    );
  });

  it('offers every correction level with its recovery note', () => {
    renderModal();

    const chips = screen.getAllByTestId('qr-generator__ec-level');
    expect(chips).toHaveLength(QR_ERROR_CORRECTION_OPTIONS.length);
    expect(chips[0].getAttribute('title')).toBe(
      `Recovers up to ${QR_ERROR_CORRECTION_OPTIONS[0].recovery} damage`
    );

    fireEvent.click(chips[1]);

    expect(chips[1].getAttribute('aria-pressed')).toBe('true');
    expect(chips[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('cuts the modules and toggles the shimmer', () => {
    renderModal();
    const shapes = screen.getAllByTestId('qr-generator__shape');
    expect(shapes).toHaveLength(QR_SHAPE_OPTIONS.length);

    fireEvent.click(shapes[1]);
    expect(shapes[1].getAttribute('aria-pressed')).toBe('true');

    const shimmer = screen.getByTestId('qr-generator__shimmer');
    expect(shimmer.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(shimmer);
    expect(shimmer.getAttribute('aria-pressed')).toBe('false');
  });

  it('refuses an empty inscription and disables both exports', () => {
    renderModal();

    typeInscription('');

    expect(screen.getByTestId('qr-generator__error').textContent).toBe(
      'Inscribe a message, address, or link to engrave.'
    );
    expect(screen.getByTestId('qr-generator__summary').textContent).toBe('Awaiting inscription');
    expect((screen.getByTestId('qr-generator__download-svg') as HTMLButtonElement).disabled).toBe(
      true
    );
    expect((screen.getByTestId('qr-generator__download-png') as HTMLButtonElement).disabled).toBe(
      true
    );
  });

  it('downloads the SVG from the live preview', () => {
    renderModal();
    const svg = screen.getByTestId('qr-generator__preview');

    fireEvent.click(screen.getByTestId('qr-generator__download-svg'));

    expect(downloads.downloadSvgElement).toHaveBeenCalledTimes(1);
    const [element, stem] = downloads.downloadSvgElement.mock.calls[0];
    expect(element).toBe(svg);
    expect(stem).toBe('admit-one-west-egg');
  });

  it('engraves a PNG and relabels the button while it works', async () => {
    let finish: () => void = () => {};
    downloads.downloadSvgAsPng.mockImplementation(
      () => new Promise<void>((resolve) => { finish = resolve; })
    );
    renderModal();
    const button = screen.getByTestId('qr-generator__download-png') as HTMLButtonElement;

    fireEvent.click(button);

    expect(downloads.downloadSvgAsPng).toHaveBeenCalledTimes(1);
    expect(button.textContent).toContain('Engraving…');
    expect(button.disabled).toBe(true);

    finish();
    await waitFor(() => expect(button.textContent).toContain('Download PNG'));
    expect(button.disabled).toBe(false);
  });

  it('closes from the button and the backdrop', () => {
    const { onClose, view } = renderModal();

    fireEvent.click(screen.getByTestId('qr-generator__close'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('qr-generator__backdrop'));
    expect(onClose).toHaveBeenCalledTimes(2);

    view.unmount();
  });
});
