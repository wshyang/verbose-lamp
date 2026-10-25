// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { pointFromElement, pointInRect, rectFromElement } from './geometry';

function elementWithRect(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({ left: 100, top: 50, width: 200, height: 100, right: 300, bottom: 150, x: 100, y: 50 }) as DOMRect;
  return el;
}

describe('element geometry', () => {
  it('normalises an element centre and rect into viewport space', () => {
    const el = elementWithRect();
    expect(pointFromElement(el)).toEqual({
      x: 200 / window.innerWidth,
      y: 100 / window.innerHeight,
    });
    expect(rectFromElement(el)).toEqual({
      x: 100 / window.innerWidth,
      y: 50 / window.innerHeight,
      w: 200 / window.innerWidth,
      h: 100 / window.innerHeight,
    });
  });
});

describe('pointInRect', () => {
  const rect = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };

  it('includes the edges and rejects each side', () => {
    expect(pointInRect({ x: 0.25, y: 0.75 }, rect)).toBe(true);
    expect(pointInRect({ x: 0.24, y: 0.5 }, rect)).toBe(false);
    expect(pointInRect({ x: 0.76, y: 0.5 }, rect)).toBe(false);
    expect(pointInRect({ x: 0.5, y: 0.24 }, rect)).toBe(false);
    expect(pointInRect({ x: 0.5, y: 0.76 }, rect)).toBe(false);
  });
});
