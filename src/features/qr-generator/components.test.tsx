// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { tryEncodeQr } from './encode';
import { buildRenderPlan, resolveQrStyle } from './geometry';
import { QR_PRESETS } from './presets';
import { GoldenQrCode } from './GoldenQrCode';
import { buildGoldenQrIds, GoldenQrDefs } from './GoldenQrDefs';
import { QrGeneratorModal } from './QrGeneratorModal';
import { QrGeneratorLauncher } from './QrGeneratorLauncher';

const exporter = vi.hoisted(() => ({ resolve: null as null | (() => void) }));

vi.mock('./export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./export')>();
  return {
    ...actual,
    downloadSvgAsPng: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          exporter.resolve = resolve;
        }),
    ),
  };
});

const encoded = tryEncodeQr({ text: QR_PRESETS[0].text, errorCorrection: 'Q' });
if (!encoded.ok) throw new Error('fixture text must encode');
const plan = buildRenderPlan(encoded.matrix, resolveQrStyle('plaque'));

describe('buildGoldenQrIds', () => {
  it('derives stable, unique ids from a React id', () => {
    const ids = buildGoldenQrIds(':r1:');
    expect(ids.gold).toBe('gq-r1-gold');
    expect(new Set(Object.values(ids)).size).toBe(Object.keys(ids).length);
  });
});

describe('GoldenQrDefs', () => {
  it('renders the gradients and filters, with a shimmer or without', () => {
    const ids = buildGoldenQrIds('test');
    const { container, rerender } = render(<GoldenQrDefs ids={ids} viewBox={20} isShimmering />);
    expect(container.querySelectorAll('linearGradient, radialGradient').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('filter').length).toBeGreaterThan(0);
    expect(container.querySelector('animate, animateTransform')).not.toBeNull();

    rerender(<GoldenQrDefs ids={ids} viewBox={20} isShimmering={false} />);
    expect(container.querySelector('animate, animateTransform')).toBeNull();
  });
});

describe('GoldenQrCode', () => {
  it('draws the symbol with a caption band', () => {
    render(<GoldenQrCode plan={plan} caption="ADMIT ONE" testId="qr__code" />);
    const svg = screen.getByTestId('qr__code');
    expect(svg.getAttribute('aria-label')).toBe('Golden QR code: ADMIT ONE');
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${plan.viewBox} ${plan.viewBox + 3.2}`);
    expect(screen.getByText('ADMIT ONE')).toBeDefined();
  });

  it('drops the caption band for a blank caption and takes a class name', () => {
    render(<GoldenQrCode plan={plan} caption="   " className="host-class" testId="qr__code" />);
    const svg = screen.getByTestId('qr__code');
    expect(svg.getAttribute('aria-label')).toBe('Golden QR code');
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${plan.viewBox} ${plan.viewBox}`);
    expect(svg.getAttribute('class')).toBe('host-class');
  });

  it('forwards the SVG ref', () => {
    const ref = { current: null as SVGSVGElement | null };
    render(<GoldenQrCode plan={plan} svgRef={ref} testId="qr__code" />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('svg');
  });
});

describe('QrGeneratorModal', () => {
  it('renders nothing while closed', () => {
    render(<QrGeneratorModal open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the preview, the summary and every control group', () => {
    render(<QrGeneratorModal open onClose={vi.fn()} />);
    expect(screen.getByText('GOLDEN QR GENERATOR')).toBeDefined();
    expect(screen.getByTestId('qr-generator__preview')).toBeDefined();
    expect(screen.getByTestId('qr-generator__summary').textContent).toContain('Version');
    expect(screen.getAllByTestId('qr-generator__preset')).toHaveLength(QR_PRESETS.length);
    expect(screen.getAllByTestId('qr-generator__ec-level').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('qr-generator__shape').length).toBeGreaterThan(0);
    expect(screen.getByTestId('qr-generator__download-svg')).toHaveProperty('disabled', false);
  });

  it('edits the inscription and the caption', async () => {
    render(<QrGeneratorModal open onClose={vi.fn()} />);
    const input = screen.getByTestId('qr-generator__input') as HTMLTextAreaElement;
    await userEvent.clear(input);
    await userEvent.type(input, 'https://west.egg');
    expect(input.value).toBe('https://west.egg');

    const caption = screen.getByTestId('qr-generator__caption') as HTMLInputElement;
    await userEvent.clear(caption);
    await userEvent.type(caption, 'ADMIT ONE');
    expect(caption.value).toBe('ADMIT ONE');
    expect(screen.getByTestId('qr-generator__preview').getAttribute('aria-label')).toContain('ADMIT ONE');
  });

  it('shows the engraving label while the PNG is being written', async () => {
    render(<QrGeneratorModal open onClose={vi.fn()} />);
    const button = screen.getByTestId('qr-generator__download-png');
    expect(button.textContent).toContain('Download PNG');
    fireEvent.click(button);
    expect(screen.getByTestId('qr-generator__download-png').textContent).toContain('Engraving');
    await act(async () => {
      exporter.resolve?.();
    });
    await waitFor(() =>
      expect(screen.getByTestId('qr-generator__download-png').textContent).toContain('Download PNG'),
    );
  });

  it('switches presets, correction levels, module cut and shimmer', async () => {
    render(<QrGeneratorModal open onClose={vi.fn()} />);
    await userEvent.click(screen.getAllByTestId('qr-generator__preset')[1]);
    expect((screen.getByTestId('qr-generator__input') as HTMLTextAreaElement).value).toBe(
      QR_PRESETS[1].text,
    );

    await userEvent.click(screen.getAllByTestId('qr-generator__ec-level').at(-1)!);
    await userEvent.click(screen.getAllByTestId('qr-generator__shape')[1]);
    expect(screen.getAllByTestId('qr-generator__shape')[1].className).toContain('bg-[#d4af37]/25');

    const shimmer = screen.getByTestId('qr-generator__shimmer');
    expect(shimmer.getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(shimmer);
    expect(screen.getByTestId('qr-generator__shimmer').getAttribute('aria-pressed')).toBe('false');
  });

  it('explains an inscription that cannot be encoded', async () => {
    render(<QrGeneratorModal open onClose={vi.fn()} />);
    const input = screen.getByTestId('qr-generator__input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'x'.repeat(6000) } });
    expect(screen.getByTestId('qr-generator__error')).toBeDefined();
    expect(screen.getByTestId('qr-generator__summary').textContent).toBe('Awaiting inscription');
    expect(screen.getByTestId('qr-generator__download-svg')).toHaveProperty('disabled', true);
  });

  it('closes from the corner button', async () => {
    const onClose = vi.fn();
    render(<QrGeneratorModal open onClose={onClose} />);
    await userEvent.click(screen.getByTestId('qr-generator__close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('QrGeneratorLauncher', () => {
  it('opens and closes the generator', async () => {
    render(<QrGeneratorLauncher className="host-class" />);
    const launcher = screen.getByTestId('qr-generator__launch');
    expect(launcher.className).toContain('host-class');
    expect(launcher.getAttribute('aria-haspopup')).toBe('dialog');

    await userEvent.click(launcher);
    expect(screen.getByRole('dialog')).toBeDefined();

    await userEvent.click(screen.getByTestId('qr-generator__close'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
