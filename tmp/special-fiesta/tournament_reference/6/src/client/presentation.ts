import type { MatchView, ModeId, ScheduleSummary } from '../shared/contracts.js';

export interface MatchSection {
  key: string;
  title: string;
  matches: MatchView[];
}

export function buildMatchSections(mode: ModeId, matches: MatchView[]): MatchSection[] {
  if (matches.length === 0) return [];
  if (mode === 'manual') return [{ key: 'desk', title: 'Desk-staged matches', matches }];
  if (mode === 'round-robin' || mode === 'swiss') return sectionsByRound(matches);
  if (mode === 'groups' || mode === 'points-rush' || mode === 'world-cup') {
    return sectionsByGroupThenRound(matches);
  }
  if (mode === 'flighted-quads') return sectionsByGroup(matches);
  if (mode === 'consolation') return sectionsByPhase(matches);
  return sectionsByRound(matches);
}

export function sortTimeline(matches: MatchView[]): MatchView[] {
  return [...matches].sort((first, second) => {
    if (first.schedule.startMinute !== second.schedule.startMinute) {
      return first.schedule.startMinute - second.schedule.startMinute;
    }
    return first.schedule.courtNumber - second.schedule.courtNumber;
  });
}

export function formatClock(totalMinutes: number): string {
  const minuteOfDay = ((totalMinutes % 1440) + 1440) % 1440;
  const hours24 = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

export function formatDuration(durationMinutes: number): string {
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

export function summaryTone(summary: ScheduleSummary): 'fits' | 'tight' {
  return summary.fits ? 'fits' : 'tight';
}

function sectionsByRound(matches: MatchView[]): MatchSection[] {
  const byRound = groupMatches(matches, (match) => String(match.roundNumber));
  return [...byRound.entries()]
    .sort(([first], [second]) => Number(first) - Number(second))
    .map(([round, roundMatches]) => ({
      key: `round-${round}`,
      title: sectionTitle(roundMatches[0]!.phase, Number(round)),
      matches: roundMatches,
    }));
}

function sectionsByGroup(matches: MatchView[]): MatchSection[] {
  const grouped = groupMatches(matches, (match) => match.groupKey ?? match.phase);
  return [...grouped.entries()].map(([key, groupMatches]) => ({
    key: slug(key),
    title: key,
    matches: sortMatches(groupMatches),
  }));
}

function sectionsByGroupThenRound(matches: MatchView[]): MatchSection[] {
  const grouped = groupMatches(matches, (match) => {
    if (match.groupKey) return `Group ${match.groupKey}`;
    return `${match.phase} · Round ${match.roundNumber}`;
  });
  return [...grouped.entries()].map(([key, groupMatches]) => ({
    key: slug(key),
    title: key,
    matches: sortMatches(groupMatches),
  }));
}

function sectionsByPhase(matches: MatchView[]): MatchSection[] {
  const grouped = groupMatches(matches, (match) => match.phase);
  return [...grouped.entries()].map(([phase, phaseMatches]) => ({
    key: slug(phase),
    title: phase,
    matches: sortMatches(phaseMatches),
  }));
}

function groupMatches(
  matches: MatchView[],
  groupKey: (match: MatchView) => string,
): Map<string, MatchView[]> {
  return matches.reduce((groups, match) => {
    const key = groupKey(match);
    const group = groups.get(key) ?? [];
    groups.set(key, [...group, match]);
    return groups;
  }, new Map<string, MatchView[]>());
}

function sortMatches(matches: MatchView[]): MatchView[] {
  return [...matches].sort((first, second) => first.position - second.position);
}

function sectionTitle(phase: string, round: number): string {
  return phase.toLowerCase().includes(`round ${round}`) ? phase : `Round ${round} · ${phase}`;
}

function slug(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
