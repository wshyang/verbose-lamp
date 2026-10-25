// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SPARKLER_DEMOS } from '../data/previewCatalogue';
import { stubPreview } from '../testing/stubPreview';
import { CelebrationSection } from './CelebrationSection';

describe('CelebrationSection sparklers', () => {
  it('offers one button per sparkler demo', () => {
    render(<CelebrationSection preview={stubPreview()} />);

    const buttons = screen.getAllByTestId('spectacle-preview__sparkler');
    expect(buttons.map((b) => b.textContent)).toEqual(SPARKLER_DEMOS.map((demo) => demo.label));
  });

  it('asks for a show of the size each button is labelled with', () => {
    const preview = stubPreview();
    render(<CelebrationSection preview={preview} />);

    for (const button of screen.getAllByTestId('spectacle-preview__sparkler')) fireEvent.click(button);

    expect(preview.playSparklers).toHaveBeenNthCalledWith(1, SPARKLER_DEMOS[0].count);
    expect(preview.playSparklers).toHaveBeenNthCalledWith(2, SPARKLER_DEMOS[1].count);
  });

  // ActionButton shows "playing" through its gold fill only; it carries no aria-pressed, so this
  // asserts the class it does have. That is an accessibility gap in the shared primitive.
  it('highlights only the show that is currently playing', () => {
    render(<CelebrationSection preview={stubPreview({ playing: new Set([SPARKLER_DEMOS[1].key]) })} />);

    const lit = screen.getAllByTestId('spectacle-preview__sparkler').map((b) => b.className.includes('from-[#a87c33]'));
    expect(lit).toEqual([false, true]);
  });
});

describe('CelebrationSection other actions', () => {
  it('still offers confetti, countdown, name reveal and the marquee toggle', () => {
    const preview = stubPreview();
    render(<CelebrationSection preview={preview} />);

    fireEvent.click(screen.getAllByTestId('spectacle-preview__confetti')[0]);
    fireEvent.click(screen.getByTestId('spectacle-preview__countdown'));
    fireEvent.click(screen.getByTestId('spectacle-preview__name-reveal'));

    expect(preview.playConfetti).toHaveBeenCalledWith('burst');
    expect(preview.playCountdown).toHaveBeenCalledTimes(1);
    expect(preview.playNameReveal).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('spectacle-preview__marquee')).toBeTruthy();
  });
});
