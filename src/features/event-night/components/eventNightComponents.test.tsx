// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EventNightHeader } from './EventNightHeader';
import { EventNightLauncher } from './EventNightLauncher';
import { StageBackdrop } from './StageBackdrop';
import { TitleMedallion } from './TitleMedallion';

const lattice = vi.hoisted(() => ({ requests: [] as unknown[] }));

vi.mock('@/features/deco-lattice', () => ({
  DecoLatticeFrame: ({ request, children }: { request: unknown; children: ReactNode }) => {
    lattice.requests.push(request);
    return <div>{children}</div>;
  },
}));
vi.mock('@/features/spectacle', () => ({ MarqueeBorder: () => <span>Marquee mock</span> }));

describe('Event Night presentational components', () => {
  it('header forwards exit and draw actions around the supplied launcher', async () => {
    const user = userEvent.setup();
    const onExit = vi.fn();
    const onOpenDraw = vi.fn();
    render(<EventNightHeader onExit={onExit} onOpenDraw={onOpenDraw} launcher={<span>Launcher slot</span>} />);
    await user.click(screen.getByTestId('event-night__back'));
    await user.click(screen.getByTestId('event-night__open-draw'));
    expect(onExit).toHaveBeenCalledOnce();
    expect(onOpenDraw).toHaveBeenCalledOnce();
    expect(screen.getByText('Launcher slot')).toBeTruthy();
    expect(screen.getByText('WEST EGG GRAND BALLROOM')).toBeTruthy();
  });

  it('launcher opens the demo with and without a class override', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const { rerender } = render(<EventNightLauncher onOpen={onOpen} />);
    await user.click(screen.getByTestId('event-night__launch'));
    rerender(<EventNightLauncher onOpen={onOpen} className="custom" />);
    expect(screen.getByTestId('event-night__launch').className).toContain('custom');
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('renders the hidden warm backdrop', () => {
    const { container } = render(<StageBackdrop />);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
    expect((container.firstElementChild as HTMLElement).style.background).toContain('radial-gradient');
  });

  it('medallion merges lattice controls and optionally shows marquee bulbs', () => {
    const { rerender } = render(
      <TitleMedallion lattice={{ seed: 12, density: 0.3 }} hasMarquee tagline="A tagline" />
    );
    expect(lattice.requests.at(-1)).toEqual({ mode: 'medallion', seed: 12, density: 0.3 });
    expect(screen.getByText('Marquee mock')).toBeTruthy();
    expect(screen.getByTestId('event-night__tagline').textContent).toBe('A tagline');
    rerender(<TitleMedallion lattice={{}} hasMarquee={false} tagline="Next" />);
    expect(screen.queryByText('Marquee mock')).toBeNull();
  });
});
