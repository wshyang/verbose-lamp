// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadSvgAsPng, downloadSvgElement, toSafeFileStem } from '@/shared/lib/svgExport';
import { DecoLatticeFrame } from '../components/DecoLatticeFrame';
import { LATTICE_EXPORT_STEM, useLatticeExport } from './useLatticeExport';

vi.mock('@/shared/lib/svgExport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/svgExport')>();
  return {
    ...actual,
    downloadSvgElement: vi.fn(),
    downloadSvgAsPng: vi.fn(() => Promise.resolve()),
  };
});


function Harness({ stem }: { stem?: string }) {
  const exporter = useLatticeExport(stem);
  return (
    <div>
      <DecoLatticeFrame request={{ seed: 1925, level: 2 }} svgRef={exporter.svgRef}>
        <span>sealed</span>
      </DecoLatticeFrame>
      <button type="button" data-testid="svg" onClick={exporter.exportSvg}>
        svg
      </button>
      <button type="button" data-testid="png" onClick={() => void exporter.exportPng()}>
        png
      </button>
      <span data-testid="stem">{exporter.fileStem}</span>
    </div>
  );
}

afterEach(() => {
  vi.mocked(downloadSvgElement).mockClear();
  vi.mocked(downloadSvgAsPng).mockClear();
});

describe('useLatticeExport', () => {
  it('exports the rendered frame as SVG', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByTestId('svg'));

    const call = vi.mocked(downloadSvgElement).mock.calls[0];
    expect(call[0].tagName.toLowerCase()).toBe('svg');
    expect(call[1]).toBe(LATTICE_EXPORT_STEM);
  });

  it('exports a larger PNG and slugifies a caller-supplied stem', async () => {
    render(<Harness stem="Spooner · Medallion" />);

    expect(screen.getByTestId('stem').textContent).toBe(toSafeFileStem('Spooner · Medallion', LATTICE_EXPORT_STEM));
    await userEvent.click(screen.getByTestId('png'));

    const call = vi.mocked(downloadSvgAsPng).mock.calls[0];
    expect(call[0].tagName.toLowerCase()).toBe('svg');
    expect(call[1]).toBe('spooner-medallion');
    expect(call[2]).toBe(1600);
  });

  it('renders the frame with the host content on top', () => {
    render(<Harness />);
    expect(screen.getByTestId('deco-lattice-frame__root').textContent).toContain('sealed');
    expect(screen.getByTestId('deco-lattice-frame__root').querySelector('svg')).toBeTruthy();
  });

  it('does nothing when the ref is not attached', async () => {
    function Detached() {
      const exporter = useLatticeExport();
      return (
        <div>
          <button type="button" data-testid="svg" onClick={exporter.exportSvg}>
            svg
          </button>
          <button type="button" data-testid="png" onClick={() => void exporter.exportPng()}>
            png
          </button>
        </div>
      );
    }
    render(<Detached />);

    await userEvent.click(screen.getByTestId('svg'));
    await userEvent.click(screen.getByTestId('png'));

    expect(downloadSvgElement).not.toHaveBeenCalled();
    expect(downloadSvgAsPng).not.toHaveBeenCalled();
  });
});

// downloadSvgAsPng now rejects when the browser cannot make a PNG. The hook hands the
// promise back to its caller, who decides how to show it, so it must not swallow it.
describe('useLatticeExport failure', () => {
  it('lets a failed PNG export reject to the caller', async () => {
    vi.mocked(downloadSvgAsPng).mockRejectedValueOnce(new Error('The browser could not produce a PNG.'));
    let exporter!: ReturnType<typeof useLatticeExport>;
    function Capture() {
      exporter = useLatticeExport();
      return <DecoLatticeFrame request={{ seed: 1925, level: 2 }} svgRef={exporter.svgRef} />;
    }
    render(<Capture />);

    await expect(exporter.exportPng()).rejects.toThrow('The browser could not produce a PNG.');
  });
});
