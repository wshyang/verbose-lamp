import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_WINNER_SUBTITLE,
  WINNER_ORIGIN,
  playWinnerCelebration,
  winnerCelebration,
} from './winnerCelebration';

const daisy = { name: 'Daisy Buchanan', subtitle: 'East Egg' };

describe('winnerCelebration', () => {
  it('bursts confetti from the celebration origin with the host seed', () => {
    const plan = winnerCelebration({ winner: daisy, seed: 4242, sparklerCount: 0 });

    expect(plan.confetti).toEqual({ mode: 'burst', origin: WINNER_ORIGIN, seed: 4242 });
  });

  it('reveals the winner by name with their own subtitle', () => {
    const plan = winnerCelebration({ winner: daisy, seed: 1, sparklerCount: 0 });

    expect(plan.nameReveal).toEqual({ name: 'Daisy Buchanan', subtitle: 'East Egg' });
  });

  it('falls back to the standard subtitle when the winner has none', () => {
    const plan = winnerCelebration({ winner: { name: 'Nick Carraway' }, seed: 1, sparklerCount: 0 });

    expect(plan.nameReveal.subtitle).toBe(DEFAULT_WINNER_SUBTITLE);
    expect(DEFAULT_WINNER_SUBTITLE).toBe('Lucky draw winner');
  });

  it('adds no sparklers when none are asked for', () => {
    expect(winnerCelebration({ winner: daisy, seed: 1, sparklerCount: 0 }).sparklers).toBeNull();
  });

  it('fans the requested number of sparklers from the same origin and seed', () => {
    const plan = winnerCelebration({ winner: daisy, seed: 7, sparklerCount: 5 });

    expect(plan.sparklers).toEqual({ origin: WINNER_ORIGIN, count: 5, seed: 7, intensity: 0.9 });
  });
});

describe('playWinnerCelebration', () => {
  it('plays confetti, then sparklers, then the name reveal', () => {
    const play = vi.fn();

    playWinnerCelebration(play, winnerCelebration({ winner: daisy, seed: 7, sparklerCount: 5 }));

    expect(play.mock.calls.map(([id]) => id)).toEqual(['confetti', 'sparkler', 'name-reveal']);
    expect(play).toHaveBeenNthCalledWith(1, 'confetti', { mode: 'burst', origin: WINNER_ORIGIN, seed: 7 });
    expect(play).toHaveBeenNthCalledWith(3, 'name-reveal', { name: 'Daisy Buchanan', subtitle: 'East Egg' });
  });

  it('skips the sparklers when the plan has none', () => {
    const play = vi.fn();

    playWinnerCelebration(play, winnerCelebration({ winner: daisy, seed: 7, sparklerCount: 0 }));

    expect(play.mock.calls.map(([id]) => id)).toEqual(['confetti', 'name-reveal']);
  });
});
