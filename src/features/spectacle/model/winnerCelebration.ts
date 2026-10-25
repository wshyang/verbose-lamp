import type {
  ConfettiParams,
  EffectHandle,
  NameRevealParams,
  NormPoint,
  SparklerParams,
  SpectacleStage,
} from './types';

/**
 * What happens when the lucky draw lands: a confetti burst, optionally a fan of party sparklers,
 * and the gilded name reveal. A pure plan, so the premiere and Event Night celebrate the same way
 * and differ only in the seed and the sparkler count they pass (modularity review 2026-10-26,
 * Issue 4).
 */
export const WINNER_ORIGIN: NormPoint = { x: 0.5, y: 0.4 };
export const DEFAULT_WINNER_SUBTITLE = 'Lucky draw winner';

const SPARKLER_INTENSITY = 0.9;

export interface Winner {
  readonly name: string;
  readonly subtitle?: string;
}

export interface WinnerCelebrationRequest {
  readonly winner: Winner;
  readonly seed: number;
  /** 0 plays no sparklers. */
  readonly sparklerCount: number;
}

export interface WinnerCelebration {
  readonly confetti: ConfettiParams;
  readonly sparklers: SparklerParams | null;
  readonly nameReveal: NameRevealParams;
}

export function winnerCelebration({ winner, seed, sparklerCount }: WinnerCelebrationRequest): WinnerCelebration {
  return {
    confetti: { mode: 'burst', origin: WINNER_ORIGIN, seed },
    sparklers:
      sparklerCount > 0
        ? { origin: WINNER_ORIGIN, count: sparklerCount, seed, intensity: SPARKLER_INTENSITY }
        : null,
    nameReveal: { name: winner.name, subtitle: winner.subtitle ?? DEFAULT_WINNER_SUBTITLE },
  };
}

/** Plays a celebration on a stage's `play`, in the order the audience should see it. */
export function playWinnerCelebration(play: SpectacleStage['play'], celebration: WinnerCelebration): EffectHandle[] {
  const handles = [play('confetti', celebration.confetti)];
  if (celebration.sparklers) handles.push(play('sparkler', celebration.sparklers));
  handles.push(play('name-reveal', celebration.nameReveal));
  return handles;
}
