// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MAX_QR_TEXT_LENGTH, QR_EMPTY_MESSAGE, tryEncodeQr } from './encode';
import { buildRenderPlan, resolveQrStyle } from './geometry';
import { MAX_QR_CAPTION_LENGTH, QR_PRESETS } from './presets';
import { useQrGenerator } from './useQrGenerator';

const first = QR_PRESETS[0];
const generator = () => renderHook(() => useQrGenerator());

describe('useQrGenerator state', () => {
  it('opens on the first preset with the plaque shape and the shimmer on', () => {
    const { result } = generator();

    expect(result.current).toMatchObject({
      text: first.text,
      caption: first.caption,
      errorCorrection: first.errorCorrection,
      shape: 'plaque',
      isShimmering: true,
      activePresetId: first.id,
      isExporting: false,
      exportError: null,
      error: null,
    });
  });

  it('encodes the opening text into a render plan and a summary that agree', () => {
    const { result } = generator();
    const encoded = tryEncodeQr({ text: first.text, errorCorrection: first.errorCorrection });
    if (!encoded.ok) throw new Error('the opening preset must encode');

    expect(result.current.plan).toEqual(buildRenderPlan(encoded.matrix, resolveQrStyle('plaque')));
    expect(result.current.summary).toEqual({
      version: result.current.plan!.version,
      size: result.current.plan!.size,
      byteCount: new TextEncoder().encode(first.text).length,
    });
  });

  it('counts bytes, not characters, for text outside ASCII', () => {
    const { result } = generator();

    act(() => result.current.setText('Café ✦'));

    expect(result.current.summary!.byteCount).toBe(new TextEncoder().encode('Café ✦').length);
    expect(result.current.summary!.byteCount).toBeGreaterThan('Café ✦'.length);
  });

  it('re-encodes when the text changes, and the preset no longer matches', () => {
    const { result } = generator();
    const before = result.current.plan;

    act(() => result.current.setText('something else'));

    expect(result.current.plan).not.toEqual(before);
    expect(result.current.activePresetId).toBeNull();
  });

  it('matches a preset by text and correction level together', () => {
    const { result } = generator();

    act(() => result.current.setErrorCorrection('L'));
    expect(result.current.activePresetId).toBeNull();
    act(() => result.current.setErrorCorrection(first.errorCorrection));

    expect(result.current.activePresetId).toBe(first.id);
  });

  it('redraws the same code in another shape: same modules, different drawing', () => {
    const { result } = generator();
    const encoded = tryEncodeQr({ text: first.text, errorCorrection: first.errorCorrection });
    if (!encoded.ok) throw new Error('the opening preset must encode');
    const plaque = result.current.plan;

    act(() => result.current.setShape('diamond'));

    expect(result.current.shape).toBe('diamond');
    expect(result.current.plan).toEqual(buildRenderPlan(encoded.matrix, resolveQrStyle('diamond')));
    expect(result.current.plan).not.toEqual(plaque);
    expect(result.current.plan!.size).toBe(plaque!.size);
  });

  it('switches the shimmer', () => {
    const { result } = generator();

    act(() => result.current.setShimmering(false));

    expect(result.current.isShimmering).toBe(false);
  });

  it('holds the caption to its limit', () => {
    const { result } = generator();

    act(() => result.current.setCaption('x'.repeat(MAX_QR_CAPTION_LENGTH + 25)));

    expect(result.current.caption).toHaveLength(MAX_QR_CAPTION_LENGTH);
  });

  it('applies a whole preset at once: text, caption and correction', () => {
    const { result } = generator();
    const preset = QR_PRESETS[2];

    act(() => result.current.applyPreset(preset));

    expect(result.current).toMatchObject({
      text: preset.text,
      caption: preset.caption,
      errorCorrection: preset.errorCorrection,
      activePresetId: preset.id,
    });
  });

  it('keeps the shape and shimmer when a preset is applied', () => {
    const { result } = generator();
    act(() => result.current.setShape('dot'));
    act(() => result.current.setShimmering(false));

    act(() => result.current.applyPreset(QR_PRESETS[1]));

    expect(result.current.shape).toBe('dot');
    expect(result.current.isShimmering).toBe(false);
  });

  it('reports an empty message instead of a plan', () => {
    const { result } = generator();

    act(() => result.current.setText(''));

    expect(result.current.plan).toBeNull();
    expect(result.current.summary).toBeNull();
    expect(result.current.error).toBe(QR_EMPTY_MESSAGE);
  });

  it('reports text that is too long instead of a plan', () => {
    const { result } = generator();

    act(() => result.current.setText('x'.repeat(MAX_QR_TEXT_LENGTH + 1)));

    expect(result.current.plan).toBeNull();
    expect(result.current.error).toBeTruthy();
    expect(result.current.error).not.toBe(QR_EMPTY_MESSAGE);
  });

  it('recovers a plan once the text is fixed', () => {
    const { result } = generator();
    act(() => result.current.setText(''));

    act(() => result.current.setText('back again'));

    expect(result.current.plan).not.toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('exposes one stable svg ref for the preview to attach', () => {
    const { result, rerender } = generator();
    const ref = result.current.svgRef;

    rerender();

    expect(result.current.svgRef).toBe(ref);
    expect(ref.current).toBeNull();
  });

  it('exposes setters whose identity does not change between renders, so memoised children stay still', () => {
    const { result, rerender } = generator();
    const before = [result.current.setCaption, result.current.applyPreset];

    rerender();

    expect([result.current.setCaption, result.current.applyPreset]).toEqual(before);
  });
});
