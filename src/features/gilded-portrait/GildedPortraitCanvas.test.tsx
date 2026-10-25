// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupDomTests } from '@/test/dom';
import { installCanvas2d, type Canvas2d } from '@/test/canvas2d';
import { GildedPortraitCanvas } from './GildedPortraitCanvas';
import type { RgbaImage } from './types';

setupDomTests();

const image = (width = 3, height = 2): RgbaImage => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4).fill(64),
});

let canvas: Canvas2d;

beforeEach(() => {
  canvas = installCanvas2d();
});

describe('GildedPortraitCanvas', () => {
  it('paints the gilded pixels at their natural size', () => {
    render(<GildedPortraitCanvas image={image()} label="Gilded portrait" isShimmering={false} />);

    const element = screen.getByTestId('gilded-portrait__preview') as HTMLCanvasElement;
    expect(element.width).toBe(3);
    expect(element.height).toBe(2);
    expect(element.getAttribute('role')).toBe('img');
    expect(element.getAttribute('aria-label')).toBe('Gilded portrait');
    expect(canvas.calls).toContain('putImageData(3x2)');
  });

  it('honours a host test id', () => {
    render(
      <GildedPortraitCanvas image={image()} label="Photo to frame" isShimmering={false} testId="host__canvas" />
    );

    expect(screen.getByTestId('host__canvas')).toBeTruthy();
  });

  it('shows the sheen only while shimmering', () => {
    const { container, rerender } = render(
      <GildedPortraitCanvas image={image()} label="p" isShimmering={false} />
    );
    expect(container.querySelector('.gilded-portrait-sheen')).toBeNull();

    rerender(<GildedPortraitCanvas image={image()} label="p" isShimmering />);

    expect(container.querySelectorAll('.gilded-portrait-sheen')).toHaveLength(1);
  });

  it('repaints when the image changes', () => {
    const { rerender } = render(
      <GildedPortraitCanvas image={image(2, 2)} label="p" isShimmering={false} />
    );
    expect(canvas.calls).toContain('putImageData(2x2)');

    rerender(<GildedPortraitCanvas image={image(5, 4)} label="p" isShimmering={false} />);

    expect(canvas.calls).toContain('putImageData(5x4)');
    expect((screen.getByTestId('gilded-portrait__preview') as HTMLCanvasElement).width).toBe(5);
  });

  it('does nothing without a 2D context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    render(<GildedPortraitCanvas image={image()} label="p" isShimmering={false} />);

    expect(canvas.calls.filter((call) => call.startsWith('putImageData('))).toHaveLength(0);
  });
});
