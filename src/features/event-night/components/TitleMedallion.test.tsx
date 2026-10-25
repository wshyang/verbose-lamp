// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupDomTests } from '@/test/dom';
import { TitleMedallion } from './TitleMedallion';

setupDomTests();

/**
 * The medallion is the event's front door: a lattice frame, the chase bulbs when the
 * host asked for them, the three-line title, and the host's tagline.
 */
describe('TitleMedallion', () => {
  const lattice = { seed: 1925 } as const;

  it('always shows the title and the host tagline', () => {
    render(<TitleMedallion lattice={lattice} hasMarquee={false} tagline="A night to remember" />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('THEGREATGATSBY');
    expect(screen.getByText('ONE NIGHT ONLY')).toBeTruthy();
    expect(screen.getByText('DINNER & DANCE')).toBeTruthy();
    expect(screen.getByTestId('event-night__tagline').textContent).toBe('A night to remember');
  });

  it('adds the 64 chase bulbs only when the host turned the marquee on', () => {
    const off = render(<TitleMedallion lattice={lattice} hasMarquee={false} tagline="" />);
    expect(screen.queryAllByTestId('marquee-border__bulb')).toHaveLength(0);
    off.unmount();

    render(<TitleMedallion lattice={lattice} hasMarquee tagline="" />);
    expect(screen.getAllByTestId('marquee-border__bulb')).toHaveLength(64);
  });

  it('renders a lattice frame behind the title', () => {
    const { container } = render(<TitleMedallion lattice={{ seed: 7, level: 2 }} hasMarquee={false} tagline="" />);

    expect(container.querySelectorAll('path').length).toBeGreaterThan(3);
  });
});
