// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_HERO_TITLE, SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '@/features/premiere';
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
      currentChapter={SEQUENCE_CHAPTERS[0]}
      heroConfig={DEFAULT_HERO_TITLE}
      activeAct={0}
      currentTime={4.32}
      duration={TOTAL_SEQUENCE_DURATION}
      isPlaying
      hudHidden={false}
      {...handlers}
      {...overrides}
    />
  );
  return handlers;
}

describe('PremiereTimeline', () => {
  it('renders one button per chapter, labelled by act and hero title', () => {
    renderTimeline();
    const chapters = screen.getAllByTestId('timeline__chapter');
    expect(chapters).toHaveLength(5);
    expect(chapters[0].textContent).toBe('I. monogram');
    expect(chapters[4].textContent).toBe('V. GATSBY');
  });

  it('follows the custom hero title on the finale button', () => {
    renderTimeline({ heroConfig: { ...DEFAULT_HERO_TITLE, mainTitle: 'CARRAWAY' } });
    expect(screen.getAllByTestId('timeline__chapter')[4].textContent).toBe('V. CARRAWAY');
  });

  it('falls back to Gatsby when the hero title is empty', () => {
    renderTimeline({ heroConfig: { ...DEFAULT_HERO_TITLE, mainTitle: '' } });
    expect(screen.getAllByTestId('timeline__chapter')[4].textContent).toBe('V. Gatsby');
  });

  it('marks the active act as the current one', () => {
    renderTimeline({ activeAct: 2 });
    const chapters = screen.getAllByTestId('timeline__chapter');
    expect(chapters[2].getAttribute('aria-current')).toBe('true');
    expect(chapters[1].getAttribute('aria-current')).toBeNull();
  });

  it('reports the selected act index', async () => {
    const user = userEvent.setup();
    const handlers = renderTimeline();
    await user.click(screen.getAllByTestId('timeline__chapter')[3]);
    expect(handlers.onSelectAct).toHaveBeenCalledWith(3);
  });

  it('labels the transport by playback state', () => {
    const { unmount } = render(
      <PremiereTimeline
        chapters={SEQUENCE_CHAPTERS}
        currentChapter={SEQUENCE_CHAPTERS[1]}
        heroConfig={DEFAULT_HERO_TITLE}
        activeAct={1}
        currentTime={11.28}
        duration={TOTAL_SEQUENCE_DURATION}
        isPlaying
        hudHidden={false}
        onSelectAct={vi.fn()}
        onTogglePlayback={vi.fn()}
        onReplay={vi.fn()}
        onScrub={vi.fn()}
      />
    );
    expect(screen.getByTestId('timeline__play-toggle').getAttribute('aria-label')).toBe(
      'Pause sequence'
    );
    unmount();

    render(
      <PremiereTimeline
        chapters={SEQUENCE_CHAPTERS}
        currentChapter={SEQUENCE_CHAPTERS[1]}
        heroConfig={DEFAULT_HERO_TITLE}
        activeAct={1}
        currentTime={11.28}
        duration={TOTAL_SEQUENCE_DURATION}
        isPlaying={false}
        hudHidden={false}
        onSelectAct={vi.fn()}
        onTogglePlayback={vi.fn()}
        onReplay={vi.fn()}
        onScrub={vi.fn()}
      />
    );
    expect(screen.getByTestId('timeline__play-toggle').getAttribute('aria-label')).toBe(
      'Play sequence'
    );
  });

  it('fires playback and replay handlers', async () => {
    const user = userEvent.setup();
    const handlers = renderTimeline();
    await user.click(screen.getByTestId('timeline__play-toggle'));
    await user.click(screen.getByTestId('timeline__replay'));
    expect(handlers.onTogglePlayback).toHaveBeenCalledOnce();
    expect(handlers.onReplay).toHaveBeenCalledOnce();
  });

  it('scrubs with a numeric value', () => {
    const handlers = renderTimeline();
    fireEvent.change(screen.getByTestId('timeline__scrubber'), { target: { value: '30' } });
    expect(handlers.onScrub).toHaveBeenLastCalledWith(30);
  });

  it('shows the act description and the time readout', () => {
    renderTimeline();
    expect(screen.getByText(SEQUENCE_CHAPTERS[0].description)).toBeDefined();
    expect(screen.getByTestId('timeline__clock').textContent).toContain('0:04');
  });

  it('hides itself from pointer events when the HUD is hidden', () => {
    renderTimeline({ hudHidden: true });
    const footer = screen.getByTestId('timeline__clock').closest('footer');
    expect(footer?.className).toContain('pointer-events-none');
  });
});
