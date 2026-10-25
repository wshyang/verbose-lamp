// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useQrGenerator } from './useQrGenerator';
import { QR_PRESETS } from './presets';
import { setupDomTests } from '@/test/dom';
import { MAX_QR_TEXT_LENGTH } from './encode';

setupDomTests();
const downloads = vi.hoisted(() => ({
  downloadSvgElement: vi.fn(),
  downloadSvgAsPng: vi.fn(),
}));
vi.mock('./export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./export')>()),
  ...downloads,
}));
/** A stand-in for the preview `<svg>` the hook holds a ref to. */
const attachSvg = (result: { current: HTMLSpanElement | null }, svg: SVGSVGElement | null) => {
  (result as unknown as { current: SVGSVGElement | null }).current = svg;
};
describe('useQrGenerator', () => {
  it('starts from the first preset', () => {
    const { result } = renderHook(() => useQrGenerator());

    expect(result.current.text).toBe(QR_PRESETS[0].text);
    expect(result.current.caption).toBe(QR_PRESETS[0].caption);
    expect(result.current.errorCorrection).toBe(QR_PRESETS[0].errorCorrection);
    expect(result.current.activePresetId).toBe(QR_PRESETS[0].id);
    expect(result.current.shape).toBe('plaque');
    expect(result.current.isShimmering).toBe(true);
    expect(result.current.plan).not.toBeNull();
    expect(result.current.summary?.size).toBeGreaterThan(20);
  });

  it('drops the active preset as soon as the inscription is edited', () => {
    const { result } = renderHook(() => useQrGenerator());

    act(() => result.current.setText('https://example.com'));

    expect(result.current.activePresetId).toBeNull();
    expect(result.current.summary?.byteCount).toBe('https://example.com'.length);
  });

  it('re-selects a preset when the text and level match it again', () => {
    const { result } = renderHook(() => useQrGenerator());
    act(() => result.current.setText('https://example.com'));

    act(() => result.current.setText(QR_PRESETS[1].text));
    act(() => result.current.setErrorCorrection(QR_PRESETS[1].errorCorrection));

    expect(result.current.activePresetId).toBe(QR_PRESETS[1].id);
  });

  it('applies a preset in one go', () => {
    const { result } = renderHook(() => useQrGenerator());

    act(() => result.current.applyPreset(QR_PRESETS[2]));

    expect(result.current.text).toBe(QR_PRESETS[2].text);
    expect(result.current.caption).toBe(QR_PRESETS[2].caption);
    expect(result.current.errorCorrection).toBe(QR_PRESETS[2].errorCorrection);
    expect(result.current.activePresetId).toBe(QR_PRESETS[2].id);
  });

  it('reports an overflow instead of a plan', () => {
    const { result } = renderHook(() => useQrGenerator());

    // Three bytes per character: 1200 of them is well past level H's capacity.
    act(() => result.current.setErrorCorrection('H'));
    act(() => result.current.setText('漢'.repeat(MAX_QR_TEXT_LENGTH)));

    expect(result.current.plan).toBeNull();
    expect(result.current.summary).toBeNull();
    expect(result.current.error).toMatch(/Too long for a single code/);
  });

  it('rebuilds the module cut with the shape', () => {
    const { result } = renderHook(() => useQrGenerator());
    const plaque = result.current.plan?.modulePath;

    act(() => result.current.setShape('diamond'));

    expect(result.current.shape).toBe('diamond');
    expect(result.current.plan?.modulePath).not.toBe(plaque);
  });

  it('ignores a download until the preview is mounted', () => {
    const { result } = renderHook(() => useQrGenerator());

    act(() => result.current.downloadSvg());

    expect(downloads.downloadSvgElement).not.toHaveBeenCalled();
  });

  it('downloads the mounted preview under a safe stem', () => {
    const { result } = renderHook(() => useQrGenerator());
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    attachSvg(result.current.svgRef as unknown as { current: HTMLSpanElement | null }, svg);

    act(() => result.current.downloadSvg());

    expect(downloads.downloadSvgElement).toHaveBeenCalledWith(svg, 'admit-one-west-egg');
  });
});
