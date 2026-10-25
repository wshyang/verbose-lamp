// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_HERO_TITLE, SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '@/features/premiere';
import { PremiereTimeline } from './PremiereTimeline';

function renderTimeline(overrides = {}) {
  const handlers = {
    onSelectAct: vi.fn(),
    onTogglePlayback: vi.fn(),
    onReplay: vi.fn(),
    onScrub: vi.fn(),
  };
  render(
    <PremiereTimeline
      chapters={SEQUENCE_CHAPTERS}
      currentChapter={SEQUENCE_CHAPTERS[0]}
      heroConfig={DEFAULT_HERO_TITLE}
      activeAct={0}
      currentTime={3.2}
      duration={TOTAL_SEQUENCE_DURATION}
      isPlaying
      hudHidden={false}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe('PremiereTimeline', () => {
  it('renders one button per act, with the hero title on Act V', () => {
    renderTimeline();
    const chapters = screen.getAllByTestId('timeline__chapter');
    expect(chapters.map((c) => c.textContent?.trim())).toEqual([
      'I. monogram',
      'II. dicaprio',
      'III. ensemble',
      'IV. director',
      'V. GATSBY',
    ]);
  });

  it('marks the active act with the selected styling', () => {
    renderTimeline({ activeAct: 2, currentChapter: SEQUENCE_CHAPTERS[2] });
    const chapters = screen.getAllByTestId('timeline__chapter');
    expect(chapters[2].className).toContain('ui-selected-bg');
    expect(chapters[0].className).not.toContain('ui-selected-bg');
  });

  it('announces play or pause according to transport state', () => {
    renderTimeline();
    expect(screen.getByTestId('timeline__play-toggle').getAttribute('aria-label')).toBe('Pause sequence');
  });

  it('selects acts, replays and scrubs through its handlers', () => {
    const handlers = renderTimeline();
    fireEvent.click(screen.getAllByTestId('timeline__chapter')[3]);
    expect(handlers.onSelectAct).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByTestId('timeline__play-toggle'));
    expect(handlers.onTogglePlayback).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId('timeline__replay'));
    expect(handlers.onReplay).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByTestId('timeline__scrubber'), { target: { value: '12.5' } });
    expect(handlers.onScrub).toHaveBeenCalledWith(12.5);
  });

  it('shows a custom hero title on the Act V button', () => {
    renderTimeline({ heroConfig: { ...DEFAULT_HERO_TITLE, mainTitle: 'DAISY' } });
    expect(screen.getAllByTestId('timeline__chapter')[4].textContent).toContain('DAISY');
  });
});
