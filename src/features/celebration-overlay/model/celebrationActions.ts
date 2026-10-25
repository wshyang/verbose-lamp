import type {
  EffectHandle,
  EffectId,
  EffectParamsMap,
  NormPoint,
  SpectacleStage,
} from '@/features/spectacle';

/**
 * The premiere's celebration catalogue (ADDENDUM-025): the crowd-pleasers
 * from the spectacle suite, as pure data. A host needs only an id and an
 * origin; this module builds the typed effect call, so the same catalogue
 * can drive any surface that can play spectacle effects.
 */

export const CELEBRATION_ORIGIN: NormPoint = { x: 0.5, y: 0.5 };

export type CelebrationGroupId = 'sparklers' | 'celebration' | 'backdrop';

export interface CelebrationGroup {
  id: CelebrationGroupId;
  heading: string;
}

export const CELEBRATION_GROUPS: readonly CelebrationGroup[] = [
  { id: 'sparklers', heading: 'Party Sparklers' },
  { id: 'celebration', heading: 'Celebration' },
  { id: 'backdrop', heading: 'Backdrop' },
] as const;

/** A typed effect invocation, discriminated so params always match the id. */
export type EffectCall = {
  [K in EffectId]: { effectId: K; params: EffectParamsMap[K] };
}[EffectId];

export interface CelebrationCallContext {
  origin: NormPoint;
  seed: number;
}

export interface CelebrationAction {
  id: string;
  label: string;
  group: CelebrationGroupId;
  /** Backdrop actions stay live until toggled off; the rest play out once. */
  isToggle: boolean;
  build: (context: CelebrationCallContext) => EffectCall;
}

function sparklerAction(
  id: string,
  label: string,
  pattern: 'sides' | 'corners',
  direction: 'outward' | 'inward',
): CelebrationAction {
  return {
    id, label, group: 'sparklers', isToggle: false,
    build: ({ origin }) => ({
      effectId: 'sparkler-transition',
      params: { origin, pattern, direction },
    }),
  };
}

export const CELEBRATION_ACTIONS: readonly CelebrationAction[] = [
  sparklerAction('sparkler-sides-outward', '2 sparklers · out', 'sides', 'outward'),
  sparklerAction('sparkler-sides-inward', '2 sparklers · in', 'sides', 'inward'),
  sparklerAction('sparkler-corners-outward', '4 sparklers · out', 'corners', 'outward'),
  sparklerAction('sparkler-corners-inward', '4 sparklers · in', 'corners', 'inward'),
  {
    id: 'fireworks-show', label: 'Fireworks show', group: 'celebration', isToggle: false,
    build: ({ seed }) => ({ effectId: 'fireworks', params: { seed, intensity: 0.75, durationMs: 8000 } }),
  },
  {
    id: 'confetti-burst', label: 'Confetti burst', group: 'celebration', isToggle: false,
    build: ({ origin, seed }) => ({ effectId: 'confetti', params: { mode: 'burst', origin, seed } }),
  },
  {
    id: 'confetti-rain', label: 'Confetti rain', group: 'celebration', isToggle: false,
    build: ({ seed }) => ({ effectId: 'confetti', params: { mode: 'rain', seed, durationMs: 3000 } }),
  },
  {
    id: 'sunburst-iris', label: 'Sunburst iris', group: 'celebration', isToggle: false,
    build: ({ origin }) => ({ effectId: 'sunburst-wipe', params: { origin, variant: 'iris' } }),
  },
  {
    id: 'countdown', label: 'Countdown to finale', group: 'celebration', isToggle: false,
    build: () => ({ effectId: 'countdown', params: { from: 3 } }),
  },
  {
    id: 'champagne', label: 'Champagne bubbles', group: 'backdrop', isToggle: true,
    build: ({ seed }) => ({ effectId: 'champagne', params: { seed } }),
  },
  {
    id: 'searchlights', label: 'Searchlights', group: 'backdrop', isToggle: true,
    build: ({ seed }) => ({ effectId: 'searchlights', params: { beams: 3, seed } }),
  },
  {
    id: 'fireworks-backdrop', label: 'Fireworks backdrop', group: 'backdrop', isToggle: true,
    build: ({ seed }) => ({
      effectId: 'fireworks',
      params: { seed, intensity: 0.55, continuous: true },
    }),
  },
] as const;

export function findCelebrationAction(id: string): CelebrationAction | null {
  return CELEBRATION_ACTIONS.find((action) => action.id === id) ?? null;
}

export function buildEffectCall(id: string, context: CelebrationCallContext): EffectCall | null {
  const action = findCelebrationAction(id);
  return action ? action.build(context) : null;
}

/**
 * One contained widening of the generic `play`: an EffectCall's params are
 * already discriminated against its id by construction above.
 */
export function playEffectCall(play: SpectacleStage['play'], call: EffectCall): EffectHandle {
  const playAny = play as (id: EffectId, params: EffectParamsMap[EffectId]) => EffectHandle;
  return playAny(call.effectId, call.params);
}

export interface CelebrationActionView {
  id: string;
  label: string;
  isToggle: boolean;
  isActive: boolean;
}

export interface CelebrationGroupView {
  id: CelebrationGroupId;
  heading: string;
  actions: readonly CelebrationActionView[];
}

/** Groups the catalogue for display, flagging which toggles are live. */
export function groupCelebrationActions(
  activeToggleIds: ReadonlySet<string>,
): readonly CelebrationGroupView[] {
  return CELEBRATION_GROUPS.map((group) => ({
    ...group,
    actions: CELEBRATION_ACTIONS.filter((action) => action.group === group.id).map((action) => ({
      id: action.id,
      label: action.label,
      isToggle: action.isToggle,
      isActive: action.isToggle && activeToggleIds.has(action.id),
    })),
  }));
}

/** Deterministic seed walk, so repeated celebrations vary without Math.random. */
export function nextSeed(seed: number): number {
  return (seed * 9301 + 49297) % 233280;
}

export const CELEBRATION_SEED = 1925;
