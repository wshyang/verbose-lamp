// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// Only the things that need a GPU or audio are doubled: the premiere runtime's canvas and the
// lucky-draw dialog. The spectacle provider, the console hook and every shell piece between
// them are the real ones, so this covers the wiring the other suites replace with stubs.
vi.mock('@/features/premiere/scene3d/PremiereCanvas', () => ({
  PremiereCanvas: () => <canvas data-testid="premiere-canvas-double" />,
}));
vi.mock('@/features/premiere/audio/cinemaAudio', () => ({
  CinemaAudioEngine: class {
    triggerActShimmer() {}
    dispose() {}
    toggle() {
      return true;
    }
  },
}));
vi.mock('@/features/lucky-draw', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/lucky-draw')>()),
  LuckyDrawStage: ({ onClose }: { onClose: () => void }) => (
    <button type="button" data-testid="lucky-draw__stage" onClick={onClose}>
      drum
    </button>
  ),
}));

import { GatsbyPremiere } from './GatsbyPremiere';

describe('GatsbyPremiere with the real spectacle stack', () => {
  it('mounts under one spectacle provider without throwing', () => {
    expect(() => render(<GatsbyPremiere onOpenEventNight={vi.fn()} />)).not.toThrow();

    expect(screen.getByTestId('cinematic-stage__canvas')).toBeTruthy();
    expect(screen.getByTestId('spectacle-preview__launch')).toBeTruthy();
  });

  it('keeps the console closed until the header launcher is used, then docks it', async () => {
    render(<GatsbyPremiere onOpenEventNight={vi.fn()} />);
    expect(screen.queryByTestId('spectacle-preview__panel')).toBeNull();

    await userEvent.click(screen.getByTestId('spectacle-preview__launch'));

    expect(screen.getByTestId('spectacle-preview__panel')).toBeTruthy();
    expect(screen.getByTestId('spectacle-preview__launch').getAttribute('aria-expanded')).toBe('true');
  });

  it('closes the console again from the same launcher', async () => {
    render(<GatsbyPremiere onOpenEventNight={vi.fn()} />);

    await userEvent.click(screen.getByTestId('spectacle-preview__launch'));
    await userEvent.click(screen.getByTestId('spectacle-preview__launch'));

    expect(screen.queryByTestId('spectacle-preview__panel')).toBeNull();
  });

  it('still reaches Event Night from the header', async () => {
    const onOpenEventNight = vi.fn();
    render(<GatsbyPremiere onOpenEventNight={onOpenEventNight} />);

    await userEvent.click(screen.getByTestId('event-night__launch'));

    expect(onOpenEventNight).toHaveBeenCalledTimes(1);
  });

  it('keeps the cinematic canvas inside the spectacle layer, so effects draw over it', () => {
    const { container } = render(<GatsbyPremiere onOpenEventNight={vi.fn()} />);

    const canvas = screen.getByTestId('cinematic-stage__canvas');
    const layer = container.firstElementChild as HTMLElement;
    expect(layer.contains(canvas)).toBe(true);
    expect(layer.className).toContain('h-dvh');
  });
});
