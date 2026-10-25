// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('play-toggle label follows isPlaying', () => {
    const { unmount } = render(<div />);
    unmount();
    renderTimeline({ isPlaying: true });
    expect(screen.getByTestId('timeline__play-toggle').getAttribute('aria-label')).toBe('Pause sequence');
  });

  it('shows the play label when paused', () => {
    renderTimeline({ isPlaying: false });
    expect(screen.getByTestId('timeline__play-toggle').getAttribute('aria-label')).toBe('Play sequence');
  });

  it('routes chapter, playback, replay, and scrub interactions', async () => {
    const user = userEvent.setup();
    const handlers = renderTimeline();
    await user.click(screen.getAllByTestId('timeline__chapter')[3]);
    await user.click(screen.getByTestId('timeline__play-toggle'));
    await user.click(screen.getByTestId('timeline__replay'));
    fireEvent.change(screen.getByTestId('timeline__scrubber'), { target: { value: '12.5' } });
    expect(handlers.onSelectAct).toHaveBeenCalledWith(3);
    expect(handlers.onTogglePlayback).toHaveBeenCalledOnce();
    expect(handlers.onReplay).toHaveBeenCalledOnce();
    expect(handlers.onScrub).toHaveBeenCalledWith(12.5);
  });

  it('hides with the HUD and falls back to the film title when the hero title is blank', () => {
    const { container } = renderTimeline({ hudHidden: true, mainTitle: '' });
    expect(container.querySelector('footer')?.className).toContain('opacity-0');
    expect(screen.getAllByTestId('timeline__chapter')[4].textContent).toBe('V. Gatsby');
  });
});
