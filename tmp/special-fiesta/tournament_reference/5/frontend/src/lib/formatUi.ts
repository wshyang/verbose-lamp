import type { MatchView, ScheduledMatch, SlotSource } from '../../../shared/types.js';
import { slotLabel } from '../../../shared/slots.js';
import { indexMatches, resolveSlotTeam } from '../../../shared/resolve.js';

export interface ModeMeta { accent: string; tagline: string }

const MODE_META: Record<string, ModeMeta> = {
  'round-robin': { accent: '#2563eb', tagline: 'One table, everyone meets everyone.' },
  'single-elimination': { accent: '#7c3aed', tagline: 'Lose once and the day is over.' },
  'double-elimination': { accent: '#db2777', tagline: 'Two losses to be eliminated.' },
  consolation: { accent: '#64748b', tagline: 'Guaranteed second game for first-round losers.' },
  swiss: { accent: '#0891b2', tagline: 'Pairings follow the standings each round.' },
  'world-cup': { accent: '#059669', tagline: 'Group tables first, then a knockout cut.' },
  'flighted-quads': { accent: '#d97706', tagline: 'Separate flights of four, each with a champion.' },
  'points-rush': { accent: '#dc2626', tagline: 'A leaderboard race across small groups.' },
  ironman: { accent: '#ea580c', tagline: 'Knockout with no rest — back-to-back matches flagged.' },
};

export function modeMeta(formatId: string): ModeMeta {
  return MODE_META[formatId] ?? { accent: '#334155', tagline: 'Tournament format.' };
}

export function phaseTone(phase: string): string {
  if (phase.includes('Grand Final') || phase === 'Final' || phase.endsWith(' Final')) return 'tone-final';
  if (phase.includes('Consolation') || phase.includes('Losers')) return 'tone-consolation';
  if (phase.includes('Group') || phase.includes('Flight') || phase.includes('Semi')) return 'tone-group';
  if (phase.includes('Swiss') || phase.includes('Play-In')) return 'tone-swiss';
  return 'tone-default';
}

export interface SlotContext {
  teams: { id: string; name: string }[];
  matches: MatchView[];
}

/** Frontend specialisation: turn a generic slot into what the room reads. */
export function slotDisplay(slot: SlotSource, context?: SlotContext): string {
  if (context === undefined) return slotLabel(slot);
  if (slot.kind !== 'winnerOf' && slot.kind !== 'loserOf') return slotLabel(slot);
  const resolved = resolveSlotTeam(slot, indexMatches(context.matches));
  if (resolved === null) return slotLabel(slot);
  const team = context.teams.find((candidate) => candidate.id === resolved);
  return team === undefined ? resolved : team.name;
}

export function linkDescriptions(match: ScheduledMatch | MatchView): string[] {
  return match.dependsOn.map((key) => {
    if (match.slotA.kind === 'winnerOf' && match.slotA.matchKey === key) return `Winner of ${key}`;
    if (match.slotA.kind === 'loserOf' && match.slotA.matchKey === key) return `Loser of ${key}`;
    if (match.slotB.kind === 'winnerOf' && match.slotB.matchKey === key) return `Winner of ${key}`;
    if (match.slotB.kind === 'loserOf' && match.slotB.matchKey === key) return `Loser of ${key}`;
    return `After ${key}`;
  });
}

export interface BracketColumn<T> {
  round: number;
  title: string;
  matches: T[];
}

export function columnsFor<T extends { round: number; phase: string }>(matches: T[]): BracketColumn<T>[] {
  const rounds = [...new Set(matches.map((match) => match.round))].sort((a, b) => a - b);
  return rounds.map((round) => {
    const inRound = matches.filter((match) => match.round === round);
    const phases = [...new Set(inRound.map((match) => match.phase))];
    return { round, title: phases.join(' · '), matches: inRound };
  });
}
