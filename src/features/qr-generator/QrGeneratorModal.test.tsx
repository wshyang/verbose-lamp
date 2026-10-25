// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QrGeneratorModal } from './QrGeneratorModal';

const PLAN = {
  size: 21, version: 1, quietZone: 2, viewBox: 25, finders: [],
  finderPaths: { ring: 'M0 0h1v1H0z', core: 'M0 0h1v1H0z' },
  modulePath: 'M1 1h1v1H1z', darkModuleCount: 1,
};

const mocks = vi.hoisted(() => ({ qr: undefined as never }));

function fixture(overrides: Record<string, unknown> = {}) {
  return {
    text: 'https://example.com', caption: 'Admit one', errorCorrection: 'Q', shape: 'plaque',
    isShimmering: true, activePresetId: 'west-egg-gala', plan: PLAN,
    summary: { version: 1, size: 21, byteCount: 19 }, error: null, isExporting: false,
    svgRef: { current: null },
    setText: vi.fn(), setCaption: vi.fn(), setErrorCorrection: vi.fn(), setShape: vi.fn(),
    setShimmering: vi.fn(), applyPreset: vi.fn(), downloadSvg: vi.fn(),
    downloadPng: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

vi.mock('./useQrGenerator', () => ({ useQrGenerator: () => mocks.qr }));

beforeEach(() => {
  mocks.qr = fixture() as never;
});

describe('QrGeneratorModal', () => {
  it('renders nothing when closed', () => {
    render(<QrGeneratorModal open={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId('qr-generator__backdrop')).toBeNull();
  });

  it('renders preview/summary and forwards every control', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<QrGeneratorModal open onClose={onClose} />);
    expect(screen.getByTestId('qr-generator__preview')).toBeTruthy();
    expect(screen.getByTestId('qr-generator__summary').textContent).toContain('19 bytes');
    await user.click(screen.getAllByTestId('qr-generator__preset')[1]);
    fireEvent.change(screen.getByTestId('qr-generator__input'), { target: { value: 'new text' } });
    fireEvent.change(screen.getByTestId('qr-generator__caption'), { target: { value: 'New caption' } });
    await user.click(screen.getAllByTestId('qr-generator__ec-level')[0]);
    await user.click(screen.getAllByTestId('qr-generator__shape')[1]);
    await user.click(screen.getByTestId('qr-generator__shimmer'));
    await user.click(screen.getByTestId('qr-generator__download-svg'));
    await user.click(screen.getByTestId('qr-generator__download-png'));
    await user.click(screen.getByTestId('qr-generator__close'));
    const qr = mocks.qr as unknown as Record<string, ReturnType<typeof vi.fn>>;
    expect(qr.applyPreset).toHaveBeenCalledOnce();
    expect(qr.setText).toHaveBeenCalledWith('new text');
    expect(qr.setCaption).toHaveBeenCalledWith('New caption');
    expect(qr.setErrorCorrection).toHaveBeenCalledWith('L');
    expect(qr.setShape).toHaveBeenCalledWith('diamond');
    expect(qr.setShimmering).toHaveBeenCalledWith(false);
    expect(qr.downloadSvg).toHaveBeenCalledOnce();
    expect(qr.downloadPng).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows errors, awaits summary, disables exports, and toggles shimmer back on', async () => {
    const user = userEvent.setup();
    mocks.qr = fixture({
      plan: null, summary: null, error: 'Too much text', isShimmering: false,
      activePresetId: null, errorCorrection: 'L', shape: 'dot',
    }) as never;
    render(<QrGeneratorModal open onClose={vi.fn()} />);
    expect(screen.getByTestId('qr-generator__error').textContent).toBe('Too much text');
    expect(screen.getByTestId('qr-generator__summary').textContent).toBe('Awaiting inscription');
    expect((screen.getByTestId('qr-generator__download-svg') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('qr-generator__download-png') as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByTestId('qr-generator__shimmer'));
    expect((mocks.qr as unknown as { setShimmering: ReturnType<typeof vi.fn> }).setShimmering)
      .toHaveBeenCalledWith(true);
  });

  it('disables PNG export and changes its label while exporting', () => {
    mocks.qr = fixture({ isExporting: true }) as never;
    render(<QrGeneratorModal open onClose={vi.fn()} />);
    const png = screen.getByTestId('qr-generator__download-png') as HTMLButtonElement;
    expect(png.disabled).toBe(true);
    expect(png.textContent).toContain('Engraving…');
    expect((screen.getByTestId('qr-generator__download-svg') as HTMLButtonElement).disabled).toBe(false);
  });
});
