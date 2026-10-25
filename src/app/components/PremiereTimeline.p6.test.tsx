// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { render, screen, fireEvent } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_HERO_TITLE, SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '@/features/premiere';

import { PremiereTimeline } from './PremiereTimeline';

import userEvent from '@testing-library/user-event';

import { setupDomTests } from '@/test/dom';

setupDomTests();
const baseProps = {
  chapters: SEQUENCE_CHAPTERS,
  currentChapter: SEQUENCE_CHAPTERS[1],
  heroConfig: DEFAULT_HERO_TITLE,
  activeAct: 1,
  currentTime: 9.5,
  duration: TOTAL_SEQUENCE_DURATION,
  isPlaying: true,
  hudHidden: false,
  onSelectAct: vi.fn(),
  onTogglePlayback: vi.fn(),
  onReplay: vi.fn(),
  onScrub: vi.fn(),
};
const renderTimeline_p6 = (overrides: Partial<typeof baseProps> = {}) =>
  render(<PremiereTimeline {...baseProps} {...overrides} />);
describe('PremiereTimeline', () => {
  it('renders one button per act with Roman numerals and labels', () => {
    renderTimeline_p6();
    const chapters = screen.getAllByTestId('timeline__chapter');
    expect(chapters).toHaveLength(SEQUENCE_CHAPTERS.length);
    expect(chapters[0].textContent).toContain('I.');
    expect(chapters[0].textContent).toContain('monogram');
    expect(chapters[4].textContent).toContain('V.');
    expect(chapters[4].textContent).toContain('GATSBY');
  });

  it('reports the act index when a chapter is chosen', async () => {
    const onSelectAct = vi.fn();
    renderTimeline_p6({ onSelectAct });
    await userEvent.click(screen.getAllByTestId('timeline__chapter')[3]);
    expect(onSelectAct).toHaveBeenCalledWith(3);
  });

  it('labels the play toggle from isPlaying and calls the handler', async () => {
    const onTogglePlayback = vi.fn();
    renderTimeline_p6({ onTogglePlayback });
    const toggle = screen.getByTestId('timeline__play-toggle');
    expect(toggle.getAttribute('aria-label')).toBe('Pause sequence');
    await userEvent.click(toggle);
    expect(onTogglePlayback).toHaveBeenCalledTimes(1);
  });

  it('replays from the beginning', async () => {
    const onReplay = vi.fn();
    renderTimeline_p6({ onReplay });
    await userEvent.click(screen.getByTestId('timeline__replay'));
    expect(onReplay).toHaveBeenCalledTimes(1);
  });

  it('scrubs to the selected second as a number', () => {
    const onScrub = vi.fn();
    renderTimeline_p6({ onScrub });
    fireEvent.change(screen.getByTestId('timeline__scrubber'), { target: { value: '30' } });
    expect(onScrub).toHaveBeenLastCalledWith(30);
  });

  it('shows the act badge, chapter label and hero title', () => {
    renderTimeline_p6({ heroConfig: { ...DEFAULT_HERO_TITLE, mainTitle: 'CARAWAY' } });
    const text = document.body.textContent ?? '';
    expect(text).toContain(`ACT ${SEQUENCE_CHAPTERS[1].actNumber}`);
    expect(text).toContain(SEQUENCE_CHAPTERS[1].label.toUpperCase());
    expect(text).toContain('CARAWAY');
  });

  it('hides from pointer and assistive focus when the HUD is hidden', () => {
    renderTimeline_p6({ hudHidden: true });
    const footer = screen.getAllByTestId('timeline__chapter')[0].closest('footer');
    expect(footer?.className ?? '').toContain('pointer-events-none');
    expect(footer?.className ?? '').toContain('opacity-0');
  });
});
