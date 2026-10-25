// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GatsbyPremiere } from './GatsbyPremiere';

// The R3F canvas needs a real WebGL context; the stage's DOM is what these tests assert.
vi.mock('@/features/premiere/scene3d/PremiereCanvas', () => ({
  PremiereCanvas: () => <div data-testid="premiere-canvas" />,
}));

vi.mock('@/features/premiere', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/features/premiere')>();
  return {
    ...original,
    usePremiereController: () => ({
      stageRef: { current: null },
      currentTime: 0,
      activeAct: 0,
      isPlaying: true,
      cameraMode: 'cinema',
      nitrateMode: false,
      soundOn: false,
      heroConfig: original.DEFAULT_HERO_TITLE,
      currentChapter: original.SEQUENCE_CHAPTERS[0],
      frameStudio: { isOpen: false, surface: 'title-cards', reveal: vi.fn(), dismiss: vi.fn() },
      togglePlayback: vi.fn(),
      selectAct: vi.fn(),
      replay: vi.fn(),
      scrub: vi.fn(),
      toggleCameraMode: vi.fn(),
      toggleNitrateMode: vi.fn(),
      toggleSound: vi.fn(),
      applyHeroTitle: vi.fn(),
    }),
  };
});

const INTERACTIVE_SELECTOR = 'button, input, select, textarea, a[href]';

/**
 * CLAUDE.md §5 makes `data-testid` a rule; this turns it into a test for the
 * surfaces a browser user can reach (ADDENDUM-022 §5.1.2, ADDENDUM-025).
 */
function expectEveryControlIsTestable() {
  const controls = Array.from(document.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR));
  expect(controls.length).toBeGreaterThan(0);
  const untagged = controls.filter((element) => !element.dataset.testid);
  expect(untagged.map((element) => element.outerHTML)).toEqual([]);
}

describe('interactive element testids', () => {
  it('covers the premiere surface and its spectacle overlay', async () => {
    render(<GatsbyPremiere onOpenEventNight={vi.fn()} />);
    expectEveryControlIsTestable();

    await userEvent.click(screen.getByTestId('spectacle-preview__launch'));
    expectEveryControlIsTestable();
  });

  it('covers the title and research dialogs', async () => {
    render(<GatsbyPremiere onOpenEventNight={vi.fn()} />);
    await userEvent.click(screen.getByTestId('premiere-header__customize'));
    expectEveryControlIsTestable();
  });
});
