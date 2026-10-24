import { v7 as uuidv7 } from 'uuid';
import type {
  MatchRecord,
  MatchSchedule,
  ModeId,
  ParticipantSlot,
  TeamRecord,
  TournamentSettings,
} from '../../shared/contracts.js';
import type { DraftParticipant } from './drafts.js';
import { buildFormatDraft } from './formats.js';
import { createScheduleSummary, scheduleDrafts } from './scheduler.js';

export interface BuildBlueprintInput {
  tournamentId: string;
  mode: ModeId;
  settings: TournamentSettings;
  teamNames: string[];
  createId?: () => string;
}

export interface TournamentBlueprint {
  teams: TeamRecord[];
  matches: MatchRecord[];
  groupKeys: string[];
  scheduleSummary: ReturnType<typeof createScheduleSummary>;
}

export function buildTournamentBlueprint(input: BuildBlueprintInput): TournamentBlueprint {
  const createId = input.createId ?? uuidv7;
  const teams = createTeams(input, createId);
  const format = buildFormatDraft(input.mode, teams);
  const schedules = scheduleDrafts(format.matches, input.settings);
  const idsByCode = new Map(format.matches.map((draft) => [draft.code, createId()]));
  const matches = format.matches.map((draft) => {
    const id = requireId(idsByCode, draft.code);
    return {
      id,
      tournamentId: input.tournamentId,
      code: draft.code,
      phase: draft.phase,
      roundNumber: draft.roundNumber,
      groupKey: draft.groupKey,
      position: draft.position,
      status: 'staged' as const,
      homeSlot: toParticipantSlot(draft.home, idsByCode),
      awaySlot: toParticipantSlot(draft.away, idsByCode),
      dependsOn: draft.dependsOnCodes.map((code) => requireId(idsByCode, code)),
      schedule: requireSchedule(schedules, draft.code),
      score: null,
    };
  });
  const scheduleSummary = createScheduleSummary(
    matches,
    input.settings.startTimeMinutes,
    input.settings.tournamentLengthMinutes,
    input.settings.courtCount,
    input.settings.matchDurationMinutes,
  );
  return { teams, matches, groupKeys: format.groupKeys, scheduleSummary };
}

function createTeams(input: BuildBlueprintInput, createId: () => string): TeamRecord[] {
  return input.teamNames.map((name, index) => ({
    id: createId(),
    tournamentId: input.tournamentId,
    name,
    seed: index + 1,
    withdrawnAt: null,
    withdrawalReason: null,
  }));
}

function toParticipantSlot(
  participant: DraftParticipant,
  idsByCode: Map<string, string>,
): ParticipantSlot {
  if (participant.kind === 'team') {
    return { kind: 'team', teamId: participant.teamId, label: participant.label };
  }
  if (participant.kind === 'outcome') {
    const matchId = requireId(idsByCode, participant.matchCode);
    return {
      kind: participant.outcome,
      matchId,
      matchCode: participant.matchCode,
      label: participant.label,
    };
  }
  if (participant.kind === 'group-rank') return participant;
  if (participant.kind === 'group-winner-rank') return participant;
  return participant;
}

function requireId(idsByCode: Map<string, string>, code: string): string {
  const id = idsByCode.get(code);
  if (!id) throw new Error(`Missing ID for match ${code}.`);
  return id;
}

export function requireSchedule(
  schedules: Map<string, MatchSchedule>,
  code: string,
): MatchSchedule {
  const schedule = schedules.get(code);
  if (!schedule) throw new Error(`Missing schedule for match ${code}.`);
  return schedule;
}
