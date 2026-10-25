// @vitest-environment jsdom
// From PR #4 (cases this branch did not already assert; see ADDENDUM-036).
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/** Mounts the whole premiere in jsdom: about 1-5 s, and the slow end under a parallel full run. */
const SLOW_TEST_MS = 30_000;

/**
 * Turns the CLAUDE.md §5 rule ("data-testid on every interactive element") into a
 * test (ADDENDUM-022 §1.2). The premiere is rendered with a stubbed controller, so
 * no WebGL context is created; everything else — header, frame studio, timeline,
 * floating toggle — is the real thing.
 */
vi.mock('@/features/premiere', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/premiere')>();
  const { useFrameStudio } = await import('@/features/frame-studio');
  const noop = () => undefined;
  return {
    ...actual,
    usePremiereShortcuts: noop,
    usePremiereController: () => {
      const frameStudio = useFrameStudio(() => null);
      return {
        stageRef: { current: null },
        currentTime: 4.32,
        activeAct: 0,
        isPlaying: true,
        cameraMode: 'cinema' as const,
        nitrateMode: false,
        soundOn: false,
        heroConfig: actual.DEFAULT_HERO_TITLE,
        currentChapter: actual.SEQUENCE_CHAPTERS[0],
        frameStudio,
        togglePlayback: noop,
        replay: noop,
        scrub: noop,
        selectAct: noop,
        toggleCameraMode: noop,
        toggleNitrateMode: noop,
        toggleSound: noop,
        applyHeroTitle: noop,
        runtime: {
          renderer: 'classic' as const,
          store: null,
          sceneCallbacks: { onTelemetry: noop, onChapterChange: noop, onFrameReady: noop },
        },
      };
    },
  };
});
const INTERACTIVE = 'button, input, select, textarea, a[href], [role="button"], [role="switch"]';
function interactiveElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(INTERACTIVE));
}
function label(element: HTMLElement): string {
  const text = element.getAttribute('aria-label') ?? element.textContent ?? '';
  return `${element.tagName.toLowerCase()}:${text.trim().slice(0, 40)}`;
}
describe('testid coverage', () => {
  it('gives every interactive element in the premiere a data-testid', async () => {
    const { GatsbyPremiere } = await import('./GatsbyPremiere');
    render(<GatsbyPremiere onOpenEventNight={() => undefined} />);

    const elements = interactiveElements();
    expect(elements.length).toBeGreaterThan(20);
    const missing = elements.filter((element) => !element.getAttribute('data-testid')).map(label);
    expect(missing).toEqual([]);
  }, SLOW_TEST_MS);

  it('keeps testids unique enough to address a single control', async () => {
    const { GatsbyPremiere } = await import('./GatsbyPremiere');
    render(<GatsbyPremiere onOpenEventNight={() => undefined} />);

    const counts = new Map<string, number>();
    for (const element of interactiveElements()) {
      const id = element.getAttribute('data-testid') ?? '';
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    // Repeated rows legitimately share one testid; unique controls must not collide
    // with each other, which is what the header nav would do if a testid were copied.
    for (const id of ['premiere-header__research', 'premiere-header__orbit', 'timeline__play-toggle']) {
      expect(counts.get(id)).toBe(1);
    }
  });
});
