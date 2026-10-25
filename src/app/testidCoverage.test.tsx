// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// The canvas and audio need a GPU and a speaker; everything else on screen is the real thing.
vi.mock('@/features/premiere/scene3d/PremiereCanvas', () => ({
  PremiereCanvas: () => <div data-testid="premiere-canvas" />,
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

import { GatsbyPremiere } from './GatsbyPremiere';

const INTERACTIVE_SELECTOR = 'button, input, select, textarea, a[href]';

/**
 * The rendered counterpart of `testidCoverageStatic.test.ts`. The static scan reads the source; this
 * reads the DOM that results, so it also sees controls built by a primitive that forwards an id,
 * and it covers the dialogs and the docked console exactly as the user opens them.
 */
function untaggedControls(): string[] {
  const controls = Array.from(document.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR));
  expect(controls.length).toBeGreaterThan(0);
  return controls.filter((element) => !element.dataset.testid).map((element) => element.outerHTML);
}

describe('rendered controls all carry a test id', () => {
  it('covers the premiere and its Frame Studio', () => {
    render(<GatsbyPremiere onOpenEventNight={vi.fn()} />);

    expect(untaggedControls()).toEqual([]);
  });

  it('covers the spectacle console once it is opened', async () => {
    render(<GatsbyPremiere onOpenEventNight={vi.fn()} />);

    await userEvent.click(screen.getByTestId('spectacle-preview__launch'));

    expect(screen.getByTestId('spectacle-preview__panel')).toBeTruthy();
    expect(untaggedControls()).toEqual([]);
  });

  it('covers the title customizer dialog', async () => {
    render(<GatsbyPremiere onOpenEventNight={vi.fn()} />);

    await userEvent.click(screen.getByTestId('premiere-header__customize'));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(untaggedControls()).toEqual([]);
  });

  it('covers the research dialog', async () => {
    render(<GatsbyPremiere onOpenEventNight={vi.fn()} />);

    await userEvent.click(screen.getByTestId('premiere-header__research'));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(untaggedControls()).toEqual([]);
  });
});
