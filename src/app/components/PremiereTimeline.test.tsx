// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_HERO_TITLE, SEQUENCE_CHAPTERS } from '@/features/premiere';
import { PremiereTimeline } from './PremiereTimeline';

function renderTimeline(overrides: Partial<Parameters<typeof PremiereTimeline>[0]> = {}) {
  const handlers = {
    onSelectAct: vi.fn(),
    onTogglePlayback: vi.fn(),
    onReplay: vi.fn(),
    onScrub: vi.fn(),
  };
  render(
    <PremiereTimeline
      chapters={SEQUENCE_CHAPTERS}
      currentChapter={SEQUENCE_CHAPTERS[2]}
      heroConfig={DEFAULT_HERO_TITLE}
      activeAct={2}
      currentTime={12.5}
      duration={38}
      isPlaying
      hudHidden={false}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe('PremiereTimeline', () => {
  it('labels every act and marks the active one', () => {
    renderTimeline();
    const chapters = screen.getAllByTestId('timeline__chapter');
    expect(chapters).toHaveLength(5);
    expect(chapters[0].textContent).toBe('I. monogram');
    expect(chapters[4].textContent).toBe('V. GATSBY');
    expect(chapters[2].className).toContain('bg-[var(--ui-selected-bg)]');
    expect(chapters[0].className).not.toContain('bg-[var(--ui-selected-bg)]');
  });

  it('shows the hero title on the last act button once it is customised', () => {
    renderTimeline({ heroConfig: { ...DEFAULT_HERO_TITLE, mainTitle: 'CARRAWAY' } });
    expect(screen.getAllByTestId('timeline__chapter')[4].textContent).toBe('V. CARRAWAY');
  });

  it('falls back to Gatsby when the custom title is empty', () => {
    renderTimeline({ heroConfig: { ...DEFAULT_HERO_TITLE, mainTitle: '' } });
    expect(screen.getAllByTestId('timeline__chapter')[4].textContent).toBe('V. Gatsby');
  });

  it('reports chapter clicks and the play toggle', async () => {
    const handlers = renderTimeline();
    await userEvent.click(screen.getAllByTestId('timeline__chapter')[3]);
    expect(handlers.onSelectAct).toHaveBeenCalledWith(3);
    await userEvent.click(screen.getByTestId('timeline__play-toggle'));
    expect(handlers.onTogglePlayback).toHaveBeenCalledTimes(1);
  });

  it('names the play toggle for the next action', () => {
    renderTimeline({ isPlaying: false });
    expect(screen.getByTestId('timeline__play-toggle').getAttribute('aria-label')).toBe('Play sequence');
  });

  it('scrubs to the chosen second and formats the clock', async () => {
    const handlers = renderTimeline();
    const scrubber = screen.getByTestId('timeline__scrubber');
    expect(scrubber.parentElement?.parentElement?.textContent).toContain('00:12');
    expect(scrubber.parentElement?.parentElement?.textContent).toContain('00:38');
    fireEvent.change(scrubber, { target: { value: '20' } });
    expect(handlers.onScrub).toHaveBeenCalledTimes(1);
    expect(handlers.onScrub).toHaveBeenCalledWith(20);
  });

  it('replays from the beginning', async () => {
    const handlers = renderTimeline();
    await userEvent.click(screen.getByTestId('timeline__replay'));
    expect(handlers.onReplay).toHaveBeenCalledTimes(1);
  });

  it('fades out with the HUD and shows the current chapter description', () => {
    const { container } = render(
      <PremiereTimeline
        chapters={SEQUENCE_CHAPTERS}
        currentChapter={SEQUENCE_CHAPTERS[0]}
        heroConfig={DEFAULT_HERO_TITLE}
        activeAct={0}
        currentTime={0}
        duration={38}
        isPlaying
        hudHidden
        onSelectAct={vi.fn()}
        onTogglePlayback={vi.fn()}
        onReplay={vi.fn()}
        onScrub={vi.fn()}
      />,
    );
    expect(container.querySelector('footer')?.className).toContain('opacity-0');
    expect(screen.getByText(/silver-nitrate projection flicker/)).toBeDefined();
  });
});
