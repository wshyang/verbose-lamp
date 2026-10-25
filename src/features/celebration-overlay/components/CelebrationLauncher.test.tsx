// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CelebrationLauncher } from './CelebrationLauncher';

const stage = vi.hoisted(() => {
  const handles: Array<{ finished: Promise<void>; stop: ReturnType<typeof vi.fn> }> = [];
  const play = vi.fn(() => {
    const handle = { finished: Promise.resolve(), stop: vi.fn() };
    handles.push(handle);
    return handle;
  });
  return { handles, play, stopAll: vi.fn() };
});

vi.mock('@/features/spectacle', () => ({
  useSpectacle: () => ({ play: stage.play, stopAll: stage.stopAll, isReady: true }),
}));

function openPanel() {
  render(<CelebrationLauncher />);
  fireEvent.click(screen.getByTestId('celebration-overlay__launch'));
  return screen.getAllByTestId('celebration-overlay__action');
}

describe('CelebrationLauncher', () => {
  it('opens a small overlay listing sparklers first', () => {
    const actions = openPanel();
    expect(screen.getByTestId('celebration-overlay__panel')).toBeTruthy();
    expect(actions[0].textContent).toContain('sparklers');
    expect(screen.getByTestId('celebration-overlay__launch').getAttribute('aria-expanded')).toBe('true');
  });

  it('plays a sparkler transition through the spectacle stage', () => {
    const actions = openPanel();
    fireEvent.click(actions[0]);
    expect(stage.play).toHaveBeenCalledWith(
      'sparkler-transition',
      expect.objectContaining({ pattern: 'sides', direction: 'outward' }),
    );
  });

  it('toggles a backdrop effect on and off, stopping its handle', () => {
    const actions = openPanel();
    const champagne = actions.find((a) => a.textContent?.includes('Champagne'));
    expect(champagne).toBeTruthy();
    fireEvent.click(champagne!);
    expect(champagne!.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(champagne!);
    expect(champagne!.getAttribute('aria-pressed')).toBe('false');
    expect(stage.handles[stage.handles.length - 1].stop).toHaveBeenCalled();
  });

  it('chains the countdown into a fireworks finale and can stop everything', () => {
    const actions = openPanel();
    const countdown = actions.find((a) => a.textContent?.includes('Countdown'));
    fireEvent.click(countdown!);
    const [, params] = stage.play.mock.calls[stage.play.mock.calls.length - 1] as unknown as [string, { onComplete?: () => void }];
    params.onComplete?.();
    expect(stage.play).toHaveBeenCalledWith('fireworks', expect.objectContaining({ finale: true }));
    fireEvent.click(screen.getByTestId('celebration-overlay__stop-all'));
    expect(stage.stopAll).toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    openPanel();
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('celebration-overlay__panel')).toBeNull();
  });
});
