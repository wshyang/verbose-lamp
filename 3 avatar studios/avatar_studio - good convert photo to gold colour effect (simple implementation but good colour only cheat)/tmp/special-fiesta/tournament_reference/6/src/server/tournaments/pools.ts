import type { TeamRecord } from '../../shared/contracts.js';
import { createMatchDraft, teamParticipant, type MatchDraft } from './drafts.js';

export interface TeamGroup {
  key: string;
  name: string;
  teams: TeamRecord[];
}

export interface PoolSchedule {
  matches: MatchDraft[];
  groups: TeamGroup[];
  roundCount: number;
}

export function createBalancedGroups(teams: TeamRecord[], groupCount: number): TeamGroup[] {
  const groups = Array.from({ length: groupCount }, (_, index) => ({
    key: String.fromCharCode(65 + index),
    name: `Group ${String.fromCharCode(65 + index)}`,
    teams: [] as TeamRecord[],
  }));
  teams.forEach((team, index) => groups[index % groupCount]!.teams.push(team));
  return groups;
}

export function createPoolSchedule(
  groups: TeamGroup[],
  codePrefix: string,
  phase: string,
  firstPosition: number,
): PoolSchedule {
  const schedules: PoolSchedule[] = [];
  let nextPosition = firstPosition;
  for (const group of groups) {
    const schedule = createGroupMatches(group, codePrefix, phase, nextPosition);
    schedules.push(schedule);
    nextPosition += schedule.matches.length;
  }
  const matches = schedules.flatMap((schedule) => schedule.matches);
  const orderedMatches = [...matches].sort((first, second) => {
    if (first.roundNumber !== second.roundNumber) return first.roundNumber - second.roundNumber;
    return first.position - second.position;
  });
  const roundCount = Math.max(0, ...schedules.map((schedule) => schedule.roundCount));
  return { matches: orderedMatches, groups, roundCount };
}

function createGroupMatches(
  group: TeamGroup,
  codePrefix: string,
  phase: string,
  firstPosition: number,
): PoolSchedule {
  const rotation: Array<TeamRecord | null> = [...group.teams];
  if (rotation.length % 2 === 1) rotation.push(null);
  const matchesPerRound = rotation.length / 2;
  const roundCount = Math.max(0, rotation.length - 1);
  const matches: MatchDraft[] = [];
  for (let round = 1; round <= roundCount; round += 1) {
    addRoundMatches(matches, rotation, matchesPerRound, group, codePrefix, phase, round, firstPosition);
    rotateTeams(rotation);
  }
  return { matches, groups: [group], roundCount };
}

function addRoundMatches(
  matches: MatchDraft[],
  rotation: Array<TeamRecord | null>,
  matchesPerRound: number,
  group: TeamGroup,
  codePrefix: string,
  phase: string,
  round: number,
  firstPosition: number,
): void {
  for (let pairing = 0; pairing < matchesPerRound; pairing += 1) {
    const home = rotation[pairing];
    const away = rotation[rotation.length - pairing - 1];
    if (!home || !away) continue;
    const sequence = matches.filter((match) => match.roundNumber === round).length + 1;
    const code = `${codePrefix}-${group.key}-R${round}-M${sequence}`;
    matches.push(
      createMatchDraft(
        code,
        phase,
        round,
        group.key,
        firstPosition + matches.length,
        teamParticipant(home),
        teamParticipant(away),
      ),
    );
  }
}

function rotateTeams(teams: Array<TeamRecord | null>): void {
  const lastTeam = teams.pop();
  if (lastTeam !== undefined) teams.splice(1, 0, lastTeam);
}

export function roundRobinGroupCount(teamCount: number): number {
  return Math.max(2, Math.min(Math.floor(teamCount / 2), Math.round(teamCount / 4)));
}
