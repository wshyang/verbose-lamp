// @vitest-environment jsdom
// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { render, screen } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_HERO_TITLE, SEQUENCE_CHAPTERS } from '@/features/premiere';

import { PremiereTimeline } from './PremiereTimeline';

function renderTimeline(
  overrides: { isPlaying?: boolean; activeAct?: number; hudHidden?: boolean; mainTitle?: string } = {},
) {
  const handlers = {
    onSelectAct: vi.fn(),
    onTogglePlayback: vi.fn(),
    onReplay: vi.fn(),
    onScrub: vi.fn(),
  };
  const activeAct = overrides.activeAct ?? 1;
  const view = render(
    <PremiereTimeline
      chapters={SEQUENCE_CHAPTERS}
      currentChapter={SEQUENCE_CHAPTERS[activeAct]}
      heroConfig={{ ...DEFAULT_HERO_TITLE, mainTitle: overrides.mainTitle ?? 'PREMIERE' }}
      activeAct={activeAct}
      currentTime={11.28}
      duration={38}
      isPlaying={overrides.isPlaying ?? true}
      hudHidden={overrides.hudHidden ?? false}
      {...handlers}
    />
  );
  return { ...handlers, container: view.container };
}
describe('PremiereTimeline', () => {
  it('renders five labelled chapters and marks the active one selected', () => {
    renderTimeline();
    const chapters = screen.getAllByTestId('timeline__chapter');
    expect(chapters.map((button) => button.textContent)).toEqual([
      'I. monogram',
      'II. dicaprio',
      'III. ensemble',
      'IV. director',
      'V. PREMIERE',
    ]);
    expect(chapters[1].className).toContain('--ui-selected-bg');
    expect(chapters[0].className).not.toContain('--ui-selected-bg');
  });

  it('hides with the HUD and falls back to the film title when the hero title is blank', () => {
    const { container } = renderTimeline({ hudHidden: true, mainTitle: '' });
    expect(container.querySelector('footer')?.className).toContain('opacity-0');
    expect(screen.getAllByTestId('timeline__chapter')[4].textContent).toBe('V. Gatsby');
  });
});
