// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { setupDomTests } from '@/test/dom';
import { GatsbyPremiere } from './GatsbyPremiere';

setupDomTests();

/**
 * Turns the CLAUDE.md §5 testid rule into a test (ADDENDUM-022 Phase 1): every
 * interactive element in the composed premiere must carry `data-testid`, so the
 * e2e suite can address it. Effects and WebGL are mocked out; this is a DOM
 * contract test, not a rendering test.
 */
vi.mock('@/features/spectacle', () => ({
  SpectacleProvider: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  useSpectacle: () => ({
    play: () => ({ finished: Promise.resolve(), stop: () => undefined }),
    stopAll: () => undefined,
    qualityTier: 'high',
    isReady: true,
    reducedMotion: false,
    simulatedReducedMotion: false,
    setSimulatedReducedMotion: () => undefined,
  }),
}));

vi.mock('@/features/premiere', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/premiere')>();
  const art = await import('@/features/art-deco-frame');
  const noop = () => undefined;
  const fixture = {
    stageRef: { current: null },
    cameraMode: 'cinema',
    nitrateMode: false,
    soundOn: false,
    heroConfig: actual.DEFAULT_HERO_TITLE,
    currentChapter: actual.SEQUENCE_CHAPTERS[0],
    activeAct: 0,
    currentTime: 0,
    isPlaying: true,
    togglePlayback: noop,
    selectAct: noop,
    replay: noop,
    scrub: noop,
    toggleCameraMode: noop,
    toggleNitrateMode: noop,
    toggleSound: noop,
    applyHeroTitle: noop,
    frameStudio: {
      isOpen: true,
      surface: 'title-cards',
      patterns: art.FRAME_SOURCES,
      baseSource: 'authored',
      layers: [],
      designGallery: [],
      activeDesignIndex: null,
      designLabel: 'Signature',
      level: 2,
      detailPercent: 50,
      detailPresets: art.INTRICACY_PRESETS,
      activePreset: null,
      isDesignPattern: true,
      proportionsOpen: false,
      genome: art.SIGNATURE_GENOME,
      borderEnabled: false,
      borderWeight: 50,
      setSurface: noop,
      selectPattern: noop,
      rerollPattern: noop,
      setLayerEnabled: noop,
      setLayerLevel: noop,
      selectDesign: noop,
      setLevel: noop,
      setDetail: noop,
      setProportionsOpen: noop,
      setGene: noop,
      setBorderEnabled: noop,
      setBorderWeight: noop,
      resetAll: noop,
      dismiss: noop,
      reveal: noop,
    },
  };
  return {
    ...actual,
    usePremiereController: () => fixture,
    usePremiereShortcuts: () => undefined,
  };
});

const INTERACTIVE = 'button, input, select, textarea, a[href], [role="button"]';

describe('premiere testid coverage', () => {
  it('gives every interactive element a data-testid', () => {
    const { container } = render(<GatsbyPremiere onOpenEventNight={() => undefined} />);
    const elements = Array.from(container.querySelectorAll<HTMLElement>(INTERACTIVE));
    expect(elements.length).toBeGreaterThan(10);
    const missing = elements
      .filter((element) => !element.dataset.testid)
      .map((element) => `${element.tagName.toLowerCase()}:${element.textContent?.trim().slice(0, 40)}`);
    expect(missing).toEqual([]);
  });

  it('mounts the spectacle console launcher in the header', () => {
    const { getByTestId } = render(<GatsbyPremiere onOpenEventNight={() => undefined} />);
    expect(getByTestId('spectacle-preview__launch').dataset.testid).toBe('spectacle-preview__launch');
  });
});
