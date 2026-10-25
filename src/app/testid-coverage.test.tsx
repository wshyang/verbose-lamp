// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_HERO_TITLE, SEQUENCE_CHAPTERS } from '@/features/premiere';
import { createFakeFrameStudio } from '@/test/fakeFrameStudio';
import { GatsbyPremiere } from './GatsbyPremiere';

/**
 * CLAUDE.md §5 as a test (ADDENDUM-022 §1.2): every interactive element in
 * the composed premiere carries a data-testid, so e2e and DOM suites never
 * have to reach for fragile selectors.
 */
vi.mock('@/features/spectacle', () => ({
  SpectacleProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useSpectacle: () => ({
    play: vi.fn(() => ({ finished: Promise.resolve(), stop: vi.fn() })),
    stopAll: vi.fn(),
    isReady: true,
  }),
}));

vi.mock('@/features/premiere', async (importActual) => {
  const actual = await importActual<typeof import('@/features/premiere')>();
  return {
    ...actual,
    usePremiereController: () => ({
      stageRef: { current: null },
      store: null,
      handleSceneTelemetry: vi.fn(),
      handleSceneChapterChange: vi.fn(),
      cameraMode: 'cinema',
      nitrateMode: false,
      soundOn: false,
      heroConfig: DEFAULT_HERO_TITLE,
      currentChapter: SEQUENCE_CHAPTERS[0],
      activeAct: 0,
      currentTime: 0,
      isPlaying: true,
      frameStudio: createFakeFrameStudio(),
      togglePlayback: vi.fn(),
      selectAct: vi.fn(),
      toggleCameraMode: vi.fn(),
      toggleNitrateMode: vi.fn(),
      toggleSound: vi.fn(),
      applyHeroTitle: vi.fn(),
      replay: vi.fn(),
      scrub: vi.fn(),
    }),
  };
});

describe('testid coverage', () => {
  it('every interactive element in the premiere has a data-testid', () => {
    render(<GatsbyPremiere onOpenEventNight={vi.fn()} />);
    const interactive = document.querySelectorAll('button, input, select, textarea');
    expect(interactive.length).toBeGreaterThan(10);
    const offenders = [...interactive]
      .filter((el) => !el.getAttribute('data-testid'))
      .map((el) => `${el.tagName}:${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30)}`);
    expect(offenders).toEqual([]);
  });
});
