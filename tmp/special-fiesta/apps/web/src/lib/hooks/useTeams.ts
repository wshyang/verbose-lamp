import { useCallback, useMemo, useState } from 'react';
import type { TeamDetailView, TeamMemberView } from '@psd/contracts';
import {
  addTeamMember,
  createTeam,
  fetchMyTeam,
  fetchTeam,
  fetchTeamMatches,
  fetchTeams,
  joinTeamByCode,
  joinTeamById,
  kickTeamMember,
  leaveTeam,
  setTeamLock,
  transferCaptaincy,
} from '../api/teams.js';
import { invalidateCached, invalidateCachedPrefix } from '../storage/cacheStore.js';
import { MY_TEAM_CACHE, MY_TEAM_TTL_MS } from '../storage/cacheNames.js';
import { useAction } from './useAction.js';
import { firstError } from './useAsyncData.js';
import { useLocalCachedData } from './useLocalCachedData.js';

/** S7–S17: create, browse, join, manage and inspect teams. */

const TEAM_TTL_MS = 30_000;
const TEAM_BROWSER_CACHE = 'teams.browse';
const TEAM_DETAIL_PREFIX = 'teams.detail.';
const TEAM_MATCHES_PREFIX = 'teams.matches.';
const TEAM_CHAT_TAIL_PREFIX = 'teamChat.tail.';

function detailCacheName(teamId: string): string {
  return `${TEAM_DETAIL_PREFIX}${teamId}`;
}

function matchesCacheName(teamId: string): string {
  return `${TEAM_MATCHES_PREFIX}${teamId}`;
}

/** A team mutation can change each of these reads; own writes never wait for a TTL. */
function invalidateTeamReads(): void {
  invalidateCached(TEAM_BROWSER_CACHE);
  invalidateCached(MY_TEAM_CACHE);
  invalidateCachedPrefix(TEAM_DETAIL_PREFIX);
  invalidateCachedPrefix(TEAM_MATCHES_PREFIX);
  // A participant may have changed teams: their former room must not warm-start the next one.
  invalidateCachedPrefix(TEAM_CHAT_TAIL_PREFIX);
}

export function useTeamBrowser(onJoined: () => void) {
  const [search, setSearch] = useState('');
  const state = useLocalCachedData({
    name: TEAM_BROWSER_CACHE,
    loader: useCallback(() => fetchTeams(), []),
    ttlMs: TEAM_TTL_MS,
  });
  const reload = state.reload;
  const onJoinedTeam = useCallback(() => {
    invalidateTeamReads();
    reload();
    onJoined();
  }, [onJoined, reload]);
  const join = useAction(joinTeamById, onJoinedTeam);

  const needle = search.trim().toLowerCase();
  const teams = useMemo(() => {
    const items = state.data?.items ?? [];
    if (!needle) return items;
    return items.filter((team) => team.teamName.toLowerCase().includes(needle));
  }, [state.data, needle]);

  return {
    teams,
    search,
    setSearch,
    isEmpty: !state.isLoading && teams.length === 0,
    isLoading: state.isLoading,
    error: state.error ?? join.error,
    joinTeam: (teamId: string) => void join.run(teamId),
    isJoining: join.isPending,
    reload: state.reload,
  };
}

export function useCreateTeam(onCreated: () => void) {
  const [teamName, setTeamName] = useState('');
  const created = useCallback(() => {
    invalidateTeamReads();
    onCreated();
  }, [onCreated]);
  const action = useAction(createTeam, created);
  return {
    teamName,
    setTeamName,
    submit: () => void action.run(teamName.trim()),
    canSubmit: teamName.trim().length >= 3,
    error: action.error,
    isPending: action.isPending,
  };
}

export function useJoinByCode(onJoined: () => void) {
  const [joinCode, setJoinCode] = useState('');
  const joined = useCallback(() => {
    invalidateTeamReads();
    onJoined();
  }, [onJoined]);
  const action = useAction(joinTeamByCode, joined);
  return {
    joinCode,
    setJoinCode: (value: string) => setJoinCode(value.toUpperCase()),
    submit: () => void action.run(joinCode.trim().toUpperCase()),
    canSubmit: joinCode.trim().length === 6,
    error: action.error,
    isPending: action.isPending,
  };
}

/** Everything the captain and members can do from S11, plus S17's history. */
export function useMyTeam(onLeft?: () => void) {
  const state = useLocalCachedData({
    name: MY_TEAM_CACHE,
    loader: useCallback(() => fetchMyTeam(), []),
    ttlMs: MY_TEAM_TTL_MS,
  });
  const team: TeamDetailView | null = state.data?.team ?? null;
  const reload = state.reload;

  const roster = useRosterActions({ team, reload, onLeft });
  const { addMember } = roster;

  const [nicknameToAdd, setNicknameToAdd] = useState('');
  const submitAddMember = useCallback(async () => {
    if (!team) return;
    const added = await addMember.run({ teamId: team.id, nickname: nicknameToAdd.trim() });
    if (added) setNicknameToAdd('');
  }, [addMember, nicknameToAdd, team]);

  const others: TeamMemberView[] = useMemo(
    () => (team?.members ?? []).filter((member) => !member.isCaptain),
    [team],
  );

  return {
    team,
    others,
    isLoading: state.isLoading,
    nicknameToAdd,
    setNicknameToAdd,
    submitAddMember,
    isAddingMember: addMember.isPending,
    ...roster.actions,
    error: firstError([state.error, roster.error]),
    reload,
  };
}

/**
 * F13–F18 — the captain-only roster verbs (S11). Each one is a named action, so the UI never
 * has to pass a flag to say which way a toggle should go.
 */
function useRosterActions(input: {
  team: TeamDetailView | null;
  reload: () => void;
  onLeft?: (() => void) | undefined;
}) {
  const { team, reload, onLeft } = input;
  const afterTeamChange = useCallback(() => {
    invalidateTeamReads();
    reload();
  }, [reload]);
  const addMember = useAction(addTeamMember, afterTeamChange);
  const kickMember = useAction(kickTeamMember, afterTeamChange);
  const toggleLock = useAction(setTeamLock, afterTeamChange);
  const promote = useAction(transferCaptaincy, afterTeamChange);
  const leave = useAction(leaveTeam, () => {
    afterTeamChange();
    onLeft?.();
  });

  return {
    addMember,
    error: firstError([
      addMember.error,
      kickMember.error,
      toggleLock.error,
      promote.error,
      leave.error,
    ]),
    actions: {
      kick: (participantId: string) => {
        if (team) void kickMember.run({ teamId: team.id, participantId });
      },
      lockTeam: () => {
        if (team) void toggleLock.run({ teamId: team.id, isLocked: true });
      },
      unlockTeam: () => {
        if (team) void toggleLock.run({ teamId: team.id, isLocked: false });
      },
      makeCaptain: (participantId: string) => {
        if (team) void promote.run({ teamId: team.id, participantId });
      },
      leaveTeamNow: () => {
        if (team) void leave.run(team.id);
      },
      isLeaving: leave.isPending,
    },
  };
}

export function useTeamDetail(teamId: string) {
  /*
   * ADR-104 — an empty id means "not known yet" (MyTeamPage mounts this before /mine has
   * answered), and it must never become a request: GET /api/teams//matches 404s with
   * "Team not found.", and that stale rejection can land AFTER the real id's success,
   * leaving an error pinned above a perfectly good match list.
   */
  const detail = useLocalCachedData({
    name: detailCacheName(teamId),
    loader: useCallback(() => (teamId === '' ? Promise.resolve(null) : fetchTeam(teamId)), [teamId]),
    ttlMs: teamId === '' ? 0 : TEAM_TTL_MS,
  });
  const matches = useLocalCachedData({
    name: matchesCacheName(teamId),
    loader: useCallback(
      () => (teamId === '' ? Promise.resolve(null) : fetchTeamMatches(teamId)),
      [teamId],
    ),
    ttlMs: teamId === '' ? 0 : TEAM_TTL_MS,
  });

  const team = detail.data?.team ?? null;
  const played = useMemo(() => matches.data?.items ?? [], [matches.data]);
  /*
   * ADR-156 — "everything finished that we did not win" was a loss until ADR-152, and the
   * subtraction quietly kept saying so afterwards: a team that drew saw the game in its L
   * column. Draws are counted directly and then taken out of the remainder, so the three
   * numbers add up to `played` by construction rather than by assumption.
   */
  const record = useMemo(() => {
    const done = played.filter((match) => match.status === 'completed');
    const wins = done.filter((match) => match.winnerTeamId === teamId).length;
    const draws = done.filter((match) => match.winnerTeamId === null).length;
    return { wins, draws, losses: done.length - wins - draws, played: done.length };
  }, [played, teamId]);

  return {
    team,
    matches: played,
    record,
    isLoading: detail.isLoading,
    error: detail.error ?? matches.error,
  };
}
