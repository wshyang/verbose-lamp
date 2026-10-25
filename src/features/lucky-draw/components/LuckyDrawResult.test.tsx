// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupDomTests } from '@/test/dom';
import { LuckyDrawResult } from './LuckyDrawResult';

setupDomTests();

const winner = { id: 'g1', name: 'Daisy Buchanan', subtitle: 'Table 4' };

/**
 * The result line is the only `aria-live` region in the lucky draw, so what it says
 * while the drum turns matters as much as what it says after it lands.
 */
describe('LuckyDrawResult', () => {
  it('announces the winner and their table once the draw lands', () => {
    render(<LuckyDrawResult phase="landed" winner={winner} guestsInDrum={300} />);

    const status = screen.getByTestId('lucky-draw__winner');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent).toContain('DAISY BUCHANAN');
    expect(status.textContent).toContain('Table 4');
    expect(status.textContent).not.toContain('GUESTS IN THE DRUM');
  });

  it('omits the subtitle when the entry has none', () => {
    render(<LuckyDrawResult phase="landed" winner={{ id: 'g2', name: 'Nick Carraway' }} guestsInDrum={8} />);

    const status = screen.getByTestId('lucky-draw__winner');
    expect(status.textContent).toBe('NICK CARRAWAY');
    expect(status.querySelector('span')).toBeNull();
  });

  it('says the drum turns while it is spinning, whatever the guest count', () => {
    render(<LuckyDrawResult phase="spinning" winner={null} guestsInDrum={300} />);

    expect(screen.getByTestId('lucky-draw__winner').textContent).toBe('THE DRUM TURNS…');
  });

  it('counts the guests still in the drum when idle', () => {
    render(<LuckyDrawResult phase="idle" winner={null} guestsInDrum={30} />);

    expect(screen.getByTestId('lucky-draw__winner').textContent).toBe('30 GUESTS IN THE DRUM');
  });

  it('falls back to the guest count when the phase says landed but no winner survived', () => {
    // A reset between the draw and the render must not print "null" into the aria-live
    // region; the drum is the honest thing to report.
    render(<LuckyDrawResult phase="landed" winner={null} guestsInDrum={2} />);

    expect(screen.getByTestId('lucky-draw__winner').textContent).toBe('2 GUESTS IN THE DRUM');
  });
});
