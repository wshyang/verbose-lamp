// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QrGeneratorModal } from './QrGeneratorModal';

import { setupDomTests } from '@/test/dom';

import { MAX_QR_CAPTION_LENGTH } from './presets';

const downloads = vi.hoisted(() => ({
  downloadSvgElement: vi.fn(),
  downloadSvgAsPng: vi.fn(),
}));
vi.mock('./export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./export')>()),
  ...downloads,
}));
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
});
