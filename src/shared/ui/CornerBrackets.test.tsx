// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CornerBrackets } from './CornerBrackets';

const marks = () => Array.from(render(<CornerBrackets sizeClass="w-4 h-4" />).container.querySelectorAll('span'));

describe('CornerBrackets', () => {
  it('draws one mark in each corner', () => {
    const corners = marks().map((mark) => ['top-2', 'bottom-2'].find((v) => mark.className.includes(v)) + ' ' + (['left-2', 'right-2'].find((h) => mark.className.includes(h)) ?? ''));

    expect(corners.sort()).toEqual(['bottom-2 left-2', 'bottom-2 right-2', 'top-2 left-2', 'top-2 right-2']);
  });

  it('opens each mark toward the centre: the border edges face the corner it sits in', () => {
    const edgeOf = (mark: HTMLElement) => mark.className.match(/border-[tblr]-2/g)!.sort().join(' ');
    const byCorner = Object.fromEntries(marks().map((mark) => [mark.className.match(/(top|bottom)-2 (left|right)-2/)![0], edgeOf(mark)]));

    expect(byCorner).toEqual({
      'top-2 left-2': 'border-l-2 border-t-2',
      'top-2 right-2': 'border-r-2 border-t-2',
      'bottom-2 left-2': 'border-b-2 border-l-2',
      'bottom-2 right-2': 'border-b-2 border-r-2',
    });
  });

  it('applies the requested size to every mark', () => {
    expect(marks().every((mark) => mark.className.includes('w-4 h-4'))).toBe(true);
  });

  it('is decorative: no pointer events, no text', () => {
    for (const mark of marks()) {
      expect(mark.className).toContain('pointer-events-none');
      expect(mark.textContent).toBe('');
    }
  });
});
