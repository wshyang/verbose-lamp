import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type {
  AdminMatchView,
  AdminStageView,
  AdminTournamentConsoleView,
  AdminTournamentView,
  AwardFeedEntryView,
  DumbCourtView,
  FixtureView,
  MatchView,
  ParticipantTotalsView,
  TournamentView,
  UpSoonView,
} from '@psd/contracts';
import { emptyStates } from '@psd/contracts';
import { defaultPipelineSpec } from '@psd/tournament/scheduler';
import { tournaments, tournamentModeChanges } from '../db/schema/index.js';
import { ActorTrace, seedDemoTeams, type DemoTeam } from './fixtures/demo-day.js';
import {
  createTestContext,
  jsonRequest,
  type ActorSession,
  type ParticipantSession,
  type TestContext,
} from './harness.js';

/**
 * ADR-326 — the day, at every size it might land at. The demo seed (ADR-314) exists
 * because the field may bring seven teams or twelve, and each count wants its own
 * rehearsal; the Simulator varies a number on a screen, but until now no suite PLAYED
 * the day at each size. This one does: for every field size from 7 to 12 it seeds the
 * demo day's own first N Kallang teams (same sign-ups, same rosters, through the API),
 * then plays a whole tournament three ways — first the hybrid/dynamic pipeline
 * (ADR-310/320/325: pool groups feeding a knockout, qualifiers first and the shortfall
 * filled from the internal table), then dumb courts (ADR-321), and finally the one-way
 * switch (ADR-336/342) interrupting a fresh day mid-group-stage: the live match drains,
 * the bracket ends itself, and every team is paid exactly once.
 *
 * It is a narration as much as a suite: every action by every actor is written to an
 * ActorTrace and printed — facilitator starts, score updates, match ends, stage
 * advances, what a participant sees on Line-ups and Results — so the day can be READ,
 * not only asserted. Assertions still stand on the API's answers underneath. The
 * participant's reading is exhaustive, never summarised: Wei_Ling, captain of the first
 * demo team, reports everything rendered on her Line-ups and Results tabs each time
 * she looks — the up-soon banner, every row with its badge, stage, court, ETA or
 * result, score, chip and time, and the empty-state words when a tab has no rows.
 *
 * Results are decided by demo order: the earlier team in the demo table wins, 3 points
 * to a consolation that grows by group (0, 1, 2) so cross-group runner-up comparisons
 * never tie. Kallang Roar, first in the table, therefore lift the cup at every size —
 * the one result the whole loop can promise before a ball is served. Matches run the
 * way a venue day actually runs: up to three live at once, one per court and
 * facilitator, with score events rotating among them instead of draining one match
 * before the next begins. The scheduler's switch-over and rest figures are advisories,
 * not gates: a seeded match-day clock starting at the agenda's 13:10 Captain's Ball
 * start on 5 Nov 2026 gives every court and team a varied actual turn-around —
 * sometimes a minute, sometimes much longer — and the trace tells each game's start
 * and end from that clock, so later games and Wei_Ling's own changing Line-ups
 * estimates can be seen moving with the day.
 */

const SIZES = [7, 8, 9, 10, 11, 12];
const TIERS = [
  { label: 'Played', points: 2 },
  { label: 'Gold', points: 10 },
];

/** The games clock: Captain's Ball starts at 13:10 on 5 Nov 2026, with advisories it may bend. */
const GAMES_START_MS = Date.parse('2026-11-05T05:10:00.000Z');
const MINUTE_MS = 60_000;
const SWITCH_OVER_ADVISORY_MINUTES = 3;
const REST_ADVISORY_MINUTES = 6;
const TIME_FORMAT = new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Singapore',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const timeOf = (iso: string | null | undefined): string =>
  iso === null || iso === undefined ? 'time still to be decided' : TIME_FORMAT.format(new Date(iso));
const timeOfMs = (ms: number): string => TIME_FORMAT.format(new Date(ms));

/** A small deterministic random source: varied days, but the same varied day every run. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Actual switch-overs: often brisk, sometimes the advisory, sometimes a long reset. */
function switchOverMinutes(random: () => number): number {
  const roll = random();
  if (roll < 0.3) return 1 + Math.floor(random() * 2);
  if (roll < 0.75) return 3 + Math.floor(random() * 3);
  return 7 + Math.floor(random() * 6);
}

/** Actual rests: sometimes almost none, sometimes well beyond the advisory. */
function restMinutes(random: () => number): number {
  const roll = random();
  if (roll < 0.3) return Math.floor(random() * 3);
  if (roll < 0.75) return 3 + Math.floor(random() * 6);
  return 10 + Math.floor(random() * 7);
}

interface FeedBody {
  mode: string;
  items: MatchView[];
  awards: AwardFeedEntryView[];
}

interface LineupsBody {
  mode: 'matches' | 'dumb';
  items: FixtureView[];
  viewerUpSoon: UpSoonView | null;
  tournament: TournamentView | null;
}

/** A fixture whose court and teams are reserved, waiting for its varied start time. */
interface PendingStart {
  match: AdminMatchView;
  courtId: string;
  startsAtMs: number;
  switchMinutes: number | null;
  restMinutes: readonly (number | null)[];
}

/** A match in flight on one court, with the rest of its scripted score still to run. */
interface LiveMatch {
  match: AdminMatchView;
  courtId: string;
  marshal: ActorSession;
  score: { a: number; b: number };
  rallies: readonly ('a' | 'b')[];
  nextRally: number;
  startsAtMs: number;
  endsAtMs: number;
  nextRallyAtMs: number;
  rallyStepMs: number;
}

/** The simulated day's clocks: when each court and team may next be asked to play. */
interface DaySimulation {
  random: () => number;
  nowMs: number;
  courtReadyAt: Map<string, number>;
  courtSwitchMinutes: Map<string, number | null>;
  teamReadyAt: Map<string, number>;
  teamRestMinutes: Map<string, number | null>;
  pending: PendingStart[];
  live: LiveMatch[];
  played: number;
  mostLive: number;
  scoredWhileOthersLive: boolean;
  switchMinutesSeen: Set<number>;
  restMinutesSeen: Set<number>;
}

for (const size of SIZES) {
  describe(`the demo day with ${size} teams`, () => {
    let ctx: TestContext;
    let desk: ActorSession;
    let marshal: ActorSession;
    const courtMarshals: ActorSession[] = [];
    let teams: DemoTeam[] = [];
    const courtIds: string[] = [];

    const nameOf = (teamId: string | null): string =>
      teams.find((team) => team.id === teamId)?.name ?? 'a team still to be decided';
    const strengthOf = (teamId: string | null): number => teams.findIndex((team) => team.id === teamId);
    const headliners = (): DemoTeam => {
      const team = teams[0];
      if (team === undefined) throw new Error('the demo field is empty');
      return team;
    };

    async function deskConsole(): Promise<AdminTournamentView> {
      const response = await ctx.app.request('/api/admin/tournament', { headers: desk.headers });
      const body = (await response.json()) as AdminTournamentConsoleView;
      if (body.tournament === null) throw new Error('no tournament on the desk console');
      return body.tournament;
    }

    /** The whole console read — the mode and the switch's own state, not just the day. */
    async function deskView(): Promise<AdminTournamentConsoleView> {
      const response = await ctx.app.request('/api/admin/tournament', { headers: desk.headers });
      return (await response.json()) as AdminTournamentConsoleView;
    }

    async function deskPost(path: string, body: unknown): Promise<AdminTournamentConsoleView> {
      const response = await ctx.app.request(`/api/admin/tournament${path}`, jsonRequest(body, desk.headers));
      expect(response.status, await response.clone().text()).toBeLessThan(300);
      return (await response.json()) as AdminTournamentConsoleView;
    }

    async function marshalPost(path: string, body: unknown, who: ActorSession = marshal): Promise<void> {
      const response = await ctx.app.request(`/api/tournament${path}`, jsonRequest(body, who.headers));
      expect(response.status, await response.clone().text()).toBeLessThan(300);
    }

    async function participantFeed(who: ParticipantSession): Promise<FeedBody> {
      const response = await ctx.app.request('/api/tournament/matches/feed', { headers: who.headers });
      return (await response.json()) as FeedBody;
    }

    async function participantTotals(who: ParticipantSession): Promise<number> {
      const response = await ctx.app.request('/api/me/scans', { headers: who.headers });
      return ((await response.json()) as { totals: ParticipantTotalsView }).totals.tournamentPoints;
    }

    /** The seat wording the Line-ups row itself uses, feeder outcome included. */
    function lineupSeat(item: FixtureView, side: 'a' | 'b'): string {
      const name = side === 'a' ? item.teamAName : item.teamBName;
      if (name !== null) return name;
      const fromSequence = side === 'a' ? item.teamAFromSequence : item.teamBFromSequence;
      const outcome = item.stage === 'third_place' ? 'Loser' : 'Winner';
      return fromSequence ? `${outcome} of #${fromSequence}` : `${outcome} TBD`;
    }

    function lineupWhere(item: FixtureView): string {
      if (item.stage === 'group') return `Group ${item.groupCode ?? ''}`;
      if (item.stage === 'third_place') return 'Third-place match';
      return `Knockout · round ${item.roundNumber}`;
    }

    /** The banner the tab shows Wei_Ling when her own next game is close, in its words. */
    function upSoonText(body: LineupsBody): string | null {
      const upSoon = body.viewerUpSoon;
      if (upSoon === null) return null;
      const fixture = body.items.find((item) => item.id === upSoon.fixtureId) ?? null;
      const court = fixture?.suggestedCourtLabel ? ` — head to ${fixture.suggestedCourtLabel}` : '';
      if (fixture?.status === 'claimed') return `Your match is in play now${court}!`;
      if (upSoon.gamesAway === 0) return `You are up next${court}!`;
      if (upSoon.gamesAway === 1) return `One match to go${court}. Stay close!`;
      return `${upSoon.gamesAway} matches to go${court}. Stay close!`;
    }

    /**
     * Everything the followed participant sees on the Line-ups tab — the up-soon banner,
     * then one trace line per fixture carrying the row's teams, badge, stage, court,
     * ETA and YOUR TEAM marker, in the order the tab shows them. No summaries, and no
     * visible field left behind: if it is on her tab, it is in the story.
     */
    async function traceLineups(trace: ActorTrace, who: ParticipantSession): Promise<FixtureView[]> {
      const response = await ctx.app.request('/api/tournament/lineups', { headers: who.headers });
      const body = (await response.json()) as LineupsBody;
      const myTeamId = teams.find((team) => team.captain.id === who.id)?.id ?? null;
      const banner = upSoonText(body);
      if (banner !== null) {
        trace.act(`PARTICIPANT ${who.nickname}`, `sees the banner “YOUR TEAM PLAYS SOON — ${banner}” on the Line-ups tab`);
      }
      body.items.forEach((item, index) => {
        const status = item.status === 'claimed' ? 'In play now' : index === 0 ? 'Up next' : `#${item.sequence}`;
        const isMine = myTeamId !== null && (item.teamAId === myTeamId || item.teamBId === myTeamId);
        const details = [
          lineupWhere(item),
          ...(item.suggestedCourtLabel !== null ? [item.suggestedCourtLabel] : []),
          ...(item.estimatedStartAt !== null && item.estimatedStartAt !== undefined ? [`~${timeOf(item.estimatedStartAt)}`] : []),
          ...(isMine ? ['YOUR TEAM'] : []),
        ];
        trace.act(`PARTICIPANT ${who.nickname}`, `sees “${lineupSeat(item, 'a')} vs ${lineupSeat(item, 'b')}” [${status}] (${details.join(' · ')}) on the Line-ups tab`);
      });
      if (body.items.length === 0) {
        const empty = body.mode === 'dumb' ? emptyStates.lineupsDumb : body.tournament !== null ? emptyStates.lineupsDone : emptyStates.lineups;
        trace.act(`PARTICIPANT ${who.nickname}`, `sees an empty Line-ups tab — “${empty}”`);
      }
      return body.items;
    }

    type FeedState = 'live' | 'ended' | 'voided';

    function feedStateOf(item: MatchView): FeedState {
      if (item.status === 'in_progress') return 'live';
      return item.isVoided ? 'voided' : 'ended';
    }

    /** The Results row's own headline: winner beat loser, a draw, or a game in play. */
    function feedHeadlineOf(item: MatchView): string {
      if (item.winnerTeamName !== null) {
        const loser = item.winnerTeamName === item.teamAName ? item.teamBName : item.teamAName;
        return `${item.winnerTeamName} beat ${loser}`;
      }
      return item.status === 'completed' ? `${item.teamAName} drew with ${item.teamBName}` : `${item.teamAName} vs ${item.teamBName}`;
    }

    /**
     * Everything she sees on the Results tab, one trace line per match in the tab's
     * order: headline, state chip, score (where the row shows one), court badge and
     * its time line — plus the game's start, which the earlier enhancement asked the
     * story to tell even though an ended row prints only its end.
     */
    async function traceResults(trace: ActorTrace, who: ParticipantSession): Promise<FeedBody> {
      const feed = await participantFeed(who);
      for (const item of feed.items) {
        const state = feedStateOf(item);
        const chip = state === 'live' ? 'LIVE' : state === 'voided' ? 'VOIDED' : 'ENDED';
        const showsScore = state === 'live' || item.scoreA !== 0 || item.scoreB !== 0;
        const score = showsScore ? ` · score ${item.scoreA} - ${item.scoreB}` : '';
        const court = item.courtLabel !== '' ? ` · ${item.courtLabel}` : '';
        const endedAt = item.completedAt !== null ? item.completedAt : item.startedAt;
        const timing = state === 'live'
          ? `Started ${timeOf(item.startedAt)}`
          : `Ended ${timeOf(endedAt)} · started ${timeOf(item.startedAt)}`;
        const struck = state === 'voided' ? ' · does not count (the line is struck through)' : '';
        trace.act(`PARTICIPANT ${who.nickname}`, `sees “${feedHeadlineOf(item)}” [${chip}]${score}${court} · ${timing}${struck} on the Results tab`);
      }
      if (feed.items.length === 0) {
        trace.act(`PARTICIPANT ${who.nickname}`, `sees an empty Results tab — “${emptyStates.matchFeed}”`);
      }
      return feed;
    }

    /** Everything she sees on Results in dumb mode: every award line with its chip, tier and time. */
    async function traceAwardResults(trace: ActorTrace, who: ParticipantSession): Promise<FeedBody> {
      const feed = await participantFeed(who);
      for (const entry of feed.awards) {
        const chip = entry.isVoided ? 'VOIDED' : 'AWARDED';
        const struck = entry.isVoided ? ' · does not count (the line is struck through)' : '';
        trace.act(`PARTICIPANT ${who.nickname}`, `sees “${entry.teamName} is awarded ${entry.points} points!” [${chip}] · ${entry.tierLabel} · ${timeOf(entry.awardedAt)}${struck} on the Results tab`);
      }
      if (feed.awards.length === 0) {
        trace.act(`PARTICIPANT ${who.nickname}`, `sees an empty Results tab — “${emptyStates.resultsDumbEmpty}”`);
      }
      return feed;
    }

    /** Consolation points for the loser: by group (0, 1, 2), so runner-up tables separate. */
    function loserPoints(match: AdminMatchView): number {
      if (match.groupCode === null) return 1;
      return Math.min(2, match.groupCode.charCodeAt(0) - 65);
    }

    /** The rally order that produces this fixture's scripted result: loser first, then winner to 3. */
    function scriptedRallies(match: AdminMatchView): ('a' | 'b')[] {
      const { a, b } = match;
      if (a.teamId === null || b.teamId === null) throw new Error(`match ${match.code} is not seated`);
      const winnerSide = strengthOf(a.teamId) < strengthOf(b.teamId) ? 'a' : 'b';
      const loserSide = winnerSide === 'a' ? 'b' : 'a';
      const rallies: ('a' | 'b')[] = [];
      for (let rally = 0; rally < loserPoints(match); rally += 1) rallies.push(loserSide, winnerSide);
      while (rallies.filter((side) => side === winnerSide).length < 3) rallies.push(winnerSide);
      return rallies;
    }

    async function startLiveMatch(trace: ActorTrace, pending: PendingStart): Promise<LiveMatch> {
      const { match, courtId } = pending;
      const { a, b } = match;
      if (a.teamId === null || b.teamId === null) throw new Error(`match ${match.code} is not seated`);
      const courtMarshal = courtMarshals[courtIds.indexOf(courtId)];
      if (courtMarshal === undefined) throw new Error('no facilitator is staffed on that court');
      const where = match.groupCode === null ? match.stageLabel : `${match.stageLabel} · Group ${match.groupCode}`;
      await marshalPost('/matches', { courtId, teamAId: a.teamId, teamBId: b.teamId }, courtMarshal);
      const rallies = scriptedRallies(match);
      const endsAtMs = pending.startsAtMs + match.plannedMinutes * MINUTE_MS;
      const rallyStepMs = (endsAtMs - pending.startsAtMs) / rallies.length;
      const turnAround = pending.switchMinutes === null ? 'first match on this court' : `${pending.switchMinutes}-minute switch-over allowed`;
      const rests = pending.restMinutes.map((minutes) => (minutes === null ? 'first game' : `${minutes} min allowed`)).join(' / ');
      trace.act(`FACILITATOR ${courtMarshal.username}`, `starts match ${match.code} (${where}) at ${timeOfMs(pending.startsAtMs)}: ${nameOf(a.teamId)} vs ${nameOf(b.teamId)} on Court ${courtIds.indexOf(courtId) + 1} — ${turnAround}; team rest ${rests} (advisories ${SWITCH_OVER_ADVISORY_MINUTES} / ${REST_ADVISORY_MINUTES} min)`);
      return {
        match,
        courtId,
        marshal: courtMarshal,
        score: { a: 0, b: 0 },
        rallies,
        nextRally: 0,
        startsAtMs: pending.startsAtMs,
        endsAtMs,
        nextRallyAtMs: pending.startsAtMs + rallyStepMs,
        rallyStepMs,
      };
    }

    /** Scores the next rally of a live match; true once its scripted score is complete. */
    async function scoreNextRally(trace: ActorTrace, live: LiveMatch): Promise<boolean> {
      const side = live.rallies[live.nextRally];
      if (side === undefined) throw new Error(`match ${live.match.code} has no rally left to score`);
      live.nextRally += 1;
      const from = live.score[side];
      live.score[side] += 1;
      await marshalPost(`/matches/${live.match.id}/score`, { side, from, to: live.score[side] }, live.marshal);
      trace.act(`FACILITATOR ${live.marshal.username}`, `updates score for match ${live.match.code}: ${nameOf(live.match.a.teamId)} ${live.score.a} – ${live.score.b} ${nameOf(live.match.b.teamId)}`);
      return live.nextRally === live.rallies.length;
    }

    async function finishLiveMatch(trace: ActorTrace, live: LiveMatch): Promise<void> {
      const { a, b } = live.match;
      const winnerId = live.score.a > live.score.b ? a.teamId : b.teamId;
      await marshalPost(`/matches/${live.match.id}/complete`, { winnerTeamId: winnerId }, live.marshal);
      const minutes = Math.round((live.endsAtMs - live.startsAtMs) / MINUTE_MS);
      trace.act(`FACILITATOR ${live.marshal.username}`, `ends match ${live.match.code} at ${timeOfMs(live.endsAtMs)}: ${nameOf(winnerId)} wins ${Math.max(live.score.a, live.score.b)} – ${Math.min(live.score.a, live.score.b)} after ${minutes} minutes`);
    }

    /** The earliest seated fixture whose two teams are both free — a live team plays nowhere else. */
    function nextPlayable(day: AdminTournamentView, reserved: readonly { match: AdminMatchView }[]): AdminMatchView | undefined {
      const liveIds = new Set(reserved.map((entry) => entry.match.id));
      const busyTeamIds = new Set(reserved.flatMap((entry) => [entry.match.a.teamId, entry.match.b.teamId]));
      return day.matches
        .filter((match) => match.status === 'scheduled' && match.a.teamId !== null && match.b.teamId !== null)
        .filter((match) => !liveIds.has(match.id) && !busyTeamIds.has(match.a.teamId) && !busyTeamIds.has(match.b.teamId))
        .sort((left, right) => left.sequence - right.sequence)[0];
    }

    /** Narrates stage changes since the last look; returns true once the groups' advancers are told. */
    async function traceTransitions(input: {
      trace: ActorTrace;
      day: AdminTournamentView;
      seen: Map<string, string>;
      captain: ParticipantSession;
      advancersTold: boolean;
    }): Promise<boolean> {
      let told = input.advancersTold;
      for (const stage of input.day.stages) {
        const was = input.seen.get(stage.id);
        input.seen.set(stage.id, stage.status);
        if (was === undefined || was === stage.status) continue;
        input.trace.act('SYSTEM', `stage ${stage.label} is ${stage.status}`);
        if (stage.kind === 'pool' && stage.status === 'completed' && !told) {
          told = await traceAdvancers(input.trace, stage);
        }
      }
      return told;
    }

    async function traceAdvancers(trace: ActorTrace, stage: AdminStageView): Promise<boolean> {
      for (const advancer of stage.advancers) {
        const how = advancer.via === 'qualifier' ? 'group winner (qualifier)' : 'best of the rest (shortfall fill)';
        trace.act('SYSTEM', `${advancer.name} advances to the Knockout — ${how}, seat ${advancer.place} of ${stage.advancers.length}`);
      }
      expect(stage.advancers).toHaveLength(4);
      return true;
    }

    function teamIdsOf(match: AdminMatchView): [string, string] {
      const { a, b } = match;
      if (a.teamId === null || b.teamId === null) throw new Error(`match ${match.code} is not seated`);
      return [a.teamId, b.teamId];
    }

    function setScenarioTime(sim: DaySimulation, ms: number): void {
      sim.nowMs = ms;
      vi.setSystemTime(new Date(ms));
    }

    /**
     * A fresh simulated day for this field size: same seed, same varied turn-arounds. The base
     * clock is the day's own start — a later day (the switch rehearsal) shifts the whole day on.
     */
    function newSimulation(baseMs: number = GAMES_START_MS): DaySimulation {
      const random = seededRandom(2_026_102_200 + size * 97);
      const courtReadyAt = new Map<string, number>();
      const courtSwitchMinutes = new Map<string, number | null>();
      for (const courtId of courtIds) {
        courtReadyAt.set(courtId, baseMs + Math.floor(random() * 3) * MINUTE_MS);
        courtSwitchMinutes.set(courtId, null);
      }
      return {
        random,
        nowMs: baseMs,
        courtReadyAt,
        courtSwitchMinutes,
        teamReadyAt: new Map(),
        teamRestMinutes: new Map(),
        pending: [],
        live: [],
        played: 0,
        mostLive: 0,
        scoredWhileOthersLive: false,
        switchMinutesSeen: new Set(),
        restMinutesSeen: new Set(),
      };
    }

    /** The court that can host this fixture soonest once its varied turn-arounds have run. */
    function courtChoice(sim: DaySimulation, match: AdminMatchView): { courtId: string; startsAtMs: number } | undefined {
      const reservedCourts = new Set([...sim.live, ...sim.pending].map((entry) => entry.courtId));
      const [teamAId, teamBId] = teamIdsOf(match);
      let best: { courtId: string; startsAtMs: number } | undefined;
      for (const courtId of courtIds) {
        if (reservedCourts.has(courtId)) continue;
        const startsAtMs = Math.max(
          sim.nowMs,
          sim.courtReadyAt.get(courtId) ?? GAMES_START_MS,
          sim.teamReadyAt.get(teamAId) ?? GAMES_START_MS,
          sim.teamReadyAt.get(teamBId) ?? GAMES_START_MS,
        );
        if (best === undefined || startsAtMs < best.startsAtMs) best = { courtId, startsAtMs };
      }
      return best;
    }

    /** Reserves every fixture that can be given a court and a varied start time now. */
    function scheduleStarts(sim: DaySimulation, day: AdminTournamentView): void {
      let candidate = nextPlayable(day, [...sim.live, ...sim.pending]);
      while (candidate !== undefined) {
        const choice = courtChoice(sim, candidate);
        if (choice === undefined) return;
        const [teamAId, teamBId] = teamIdsOf(candidate);
        const pending: PendingStart = {
          match: candidate,
          courtId: choice.courtId,
          startsAtMs: choice.startsAtMs,
          switchMinutes: sim.courtSwitchMinutes.get(choice.courtId) ?? null,
          restMinutes: [sim.teamRestMinutes.get(teamAId) ?? null, sim.teamRestMinutes.get(teamBId) ?? null],
        };
        sim.pending.push(pending);
        if (pending.switchMinutes !== null) sim.switchMinutesSeen.add(pending.switchMinutes);
        for (const minutes of pending.restMinutes) if (minutes !== null) sim.restMinutesSeen.add(minutes);
        candidate = nextPlayable(day, [...sim.live, ...sim.pending]);
      }
    }

    /** After a game, its court and both teams get their next varied turn-around allowances. */
    function recordTurnAround(sim: DaySimulation, live: LiveMatch): void {
      const switchMinutes = switchOverMinutes(sim.random);
      sim.courtReadyAt.set(live.courtId, live.endsAtMs + switchMinutes * MINUTE_MS);
      sim.courtSwitchMinutes.set(live.courtId, switchMinutes);
      for (const teamId of teamIdsOf(live.match)) {
        const rest = restMinutes(sim.random);
        sim.teamReadyAt.set(teamId, live.endsAtMs + rest * MINUTE_MS);
        sim.teamRestMinutes.set(teamId, rest);
      }
    }

    const earliestPending = (sim: DaySimulation): PendingStart | undefined =>
      [...sim.pending].sort((left, right) => left.startsAtMs - right.startsAtMs)[0];
    const earliestLive = (sim: DaySimulation): LiveMatch | undefined =>
      [...sim.live].sort((left, right) => left.nextRallyAtMs - right.nextRallyAtMs)[0];

    async function processNextStart(sim: DaySimulation, trace: ActorTrace): Promise<void> {
      const pending = earliestPending(sim);
      if (pending === undefined) return;
      sim.pending.splice(sim.pending.indexOf(pending), 1);
      setScenarioTime(sim, pending.startsAtMs);
      sim.live.push(await startLiveMatch(trace, pending));
      sim.mostLive = Math.max(sim.mostLive, sim.live.length);
    }

    async function processNextRally(sim: DaySimulation, trace: ActorTrace): Promise<void> {
      const live = earliestLive(sim);
      if (live === undefined) return;
      setScenarioTime(sim, live.nextRallyAtMs);
      if (sim.live.length > 1) sim.scoredWhileOthersLive = true;
      if (!(await scoreNextRally(trace, live))) {
        live.nextRallyAtMs += live.rallyStepMs;
        return;
      }
      setScenarioTime(sim, live.endsAtMs);
      await finishLiveMatch(trace, live);
      sim.live.splice(sim.live.indexOf(live), 1);
      sim.played += 1;
      recordTurnAround(sim, live);
    }

    function expectVariedTimings(sim: DaySimulation): void {
      const switches = [...sim.switchMinutesSeen];
      const rests = [...sim.restMinutesSeen];
      expect(Math.min(...switches)).toBeLessThanOrEqual(2);
      expect(Math.max(...switches)).toBeGreaterThanOrEqual(7);
      expect(Math.min(...rests)).toBeLessThan(REST_ADVISORY_MINUTES);
      expect(Math.max(...rests)).toBeGreaterThan(REST_ADVISORY_MINUTES);
    }

    /**
     * Plays into the group stage only until one match is done and another is still on
     * court — the moment a real hall would call the desk about the early close. The
     * stopped simulation is returned whole: its live matches are the switch's drain.
     */
    async function playUntilMidStage(sim: DaySimulation, trace: ActorTrace): Promise<{ live: LiveMatch[]; finishedBefore: number; stageLabel: string }> {
      let stageLabel = '';
      for (let guard = 0; guard < 120; guard += 1) {
        const day = await deskConsole();
        const active = day.stages.find((stage) => stage.status === 'active');
        if (active !== undefined) stageLabel = active.label;
        scheduleStarts(sim, day);
        const pending = earliestPending(sim);
        const inFlight = earliestLive(sim);
        if (pending !== undefined && (inFlight === undefined || pending.startsAtMs <= inFlight.nextRallyAtMs)) {
          await processNextStart(sim, trace);
          continue;
        }
        if (inFlight !== undefined) {
          if (sim.played >= 1 && sim.live.length >= 1) {
            return { live: [...sim.live], finishedBefore: sim.played, stageLabel };
          }
          await processNextRally(sim, trace);
        }
      }
      throw new Error('the group stage never put a second match on court');
    }

    /** Plays until every stage is completed; the desk closes a stage by hand if its cut ties. */
    async function playAllMatches(trace: ActorTrace, captain: ParticipantSession, opening: readonly FixtureView[]): Promise<number> {
      const seen = new Map<string, string>();
      const sim = newSimulation();
      let told = false;
      let reported = false;
      setScenarioTime(sim, GAMES_START_MS);
      for (let guard = 0; guard < 600; guard += 1) {
        const day = await deskConsole();
        told = await traceTransitions({ trace, day, seen, captain, advancersTold: told });
        if (told && !reported) {
          // The groups are done and the Knockout is seated: she reads both tabs in full.
          // Its due times must have moved from the morning forecast as real games ended.
          reported = true;
          await traceResults(trace, captain);
          const reseated = await traceLineups(trace, captain);
          const forecast = opening.filter((item) => item.stage === 'knockout').map((item) => item.estimatedStartAt);
          const nowPlanned = reseated.filter((item) => item.stage === 'knockout').map((item) => item.estimatedStartAt);
          expect(nowPlanned).not.toEqual(forecast);
        }
        if (day.stages.every((stage) => stage.status === 'completed')) {
          expect(sim.live).toEqual([]);
          expect(sim.pending).toEqual([]);
          expect(sim.mostLive).toBe(courtIds.length);
          expect(sim.scoredWhileOthersLive).toBe(true);
          expectVariedTimings(sim);
          return sim.played;
        }
        // The next thing that happens is whichever comes first on the day clock: a
        // reserved game starting after its turn-arounds, or the next rally anywhere.
        scheduleStarts(sim, day);
        const pending = earliestPending(sim);
        const live = earliestLive(sim);
        if (pending !== undefined && (live === undefined || pending.startsAtMs <= live.nextRallyAtMs)) {
          await processNextStart(sim, trace);
          continue;
        }
        if (live !== undefined) {
          await processNextRally(sim, trace);
          continue;
        }
        const active = day.stages.find((stage) => stage.status === 'active');
        if (active === undefined) throw new Error('no playable match and no active stage');
        trace.act('SUPERADMIN superadmin', `closes stage ${active.label} by hand — the cut is tied and the table cannot call it`);
        await deskPost(`/stages/${active.id}/complete`, { overrides: [], reason: 'Level on the cut; the desk calls it.' });
      }
      throw new Error('the day did not finish inside the guard');
    }

    async function startHybridDay(trace: ActorTrace, startMs: number = GAMES_START_MS): Promise<void> {
      vi.setSystemTime(new Date(startMs));
      const teamIds = teams.map((team) => team.id);
      await deskPost('', { name: `Hybrid day (${size} teams)`, winPoints: 30, drawPoints: 20, lossPoints: 10, teamIds });
      trace.act('SUPERADMIN superadmin', `creates the tournament draft with ${size} demo teams entered: ${teams.map((team) => team.name).join(', ')}`);
      const started = await deskPost('/activate', {
        pipeline: defaultPipelineSpec(),
        matchMinutes: 12,
        changeoverMinutes: SWITCH_OVER_ADVISORY_MINUTES,
        restMinutes: REST_ADVISORY_MINUTES,
        deadlineAt: null,
      });
      const stages = started.tournament?.stages ?? [];
      trace.act('SUPERADMIN superadmin', `presses Start at ${timeOfMs(startMs)} on ${DATE_FORMAT.format(new Date(startMs))} — the agenda's Captain's Ball start — on the pipeline (${stages.map((stage) => stage.label).join(' then ')}) with advisory turn-arounds of ${SWITCH_OVER_ADVISORY_MINUTES} minutes between games on a court and ${REST_ADVISORY_MINUTES} minutes' rest for a team`);
    }

    /** The day's last match, and the team that won it. */
    function championOf(day: AdminTournamentView): { final: AdminMatchView; championId: string | null } {
      const final = day.matches
        .filter((match) => match.stageLabel === 'Knockout')
        .sort((left, right) => right.sequence - left.sequence)[0];
      if (final === undefined) throw new Error('the knockout produced no final');
      return { final, championId: final.winnerSide === 'a' ? final.a.teamId : final.b.teamId };
    }

    async function finishHybridDay(trace: ActorTrace, captain: ParticipantSession, played: number): Promise<void> {
      const day = await deskConsole();
      expect(day.stages.map((stage) => stage.status)).toEqual(['completed', 'completed']);
      const { final, championId } = championOf(day);
      trace.act('SYSTEM', `${nameOf(championId)} wins the tournament — the final ends ${final.scoreA} – ${final.scoreB} at ${timeOf(final.endedAt)}`);
      expect(championId).toBe(headliners().id);
      expect(played).toBe(day.matches.filter((match) => match.status !== 'cancelled').length);
      expect(
        day.matches
          .filter((match) => match.status !== 'cancelled')
          .every((match) => match.startedAt !== null && match.endedAt !== null && Date.parse(match.endedAt) > Date.parse(match.startedAt)),
      ).toBe(true);
      const feed = await traceResults(trace, captain);
      expect(feed.items.length).toBe(day.matches.filter((match) => match.status !== 'cancelled').length);
      expect(feed.items.every((item) => item.winnerTeamName !== null && item.completedAt !== null)).toBe(true);
      const points = await participantTotals(captain);
      trace.act(`PARTICIPANT ${captain.nickname}`, `sees ${points} tournament points on their own totals`);
      expect(points).toBeGreaterThan(0);
      await deskPost('/close', { reason: null });
      trace.act('SUPERADMIN superadmin', 'closes the tournament — the hybrid day is done');
    }

    beforeAll(async () => {
      ctx = await createTestContext();
      desk = await ctx.signInSuperadmin();
      marshal = await ctx.createFacilitator();
      courtMarshals.push(marshal, await ctx.createFacilitator(), await ctx.createFacilitator());
      teams = await seedDemoTeams(ctx, size);
      for (const courtNumber of [1, 2, 3]) {
        const view = await deskPost('/courts', { courtNumber, label: `Court ${courtNumber}` });
        const court = view.courts[courtNumber - 1];
        if (court === undefined) throw new Error('court not created');
        courtIds.push(court.id);
      }
    });

    afterAll(async () => {
      await ctx.close();
    });

    it('plays the hybrid/dynamic day: groups, a filled knockout, and a winner', async () => {
      const trace = new ActorTrace(`hybrid/dynamic pipeline · ${size} teams`);
      // Only the Date is faked, so the app's own stamps and re-plans run on the
      // match-day clock while PGlite and the test runner keep real timers.
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        await startHybridDay(trace);
        const captain = headliners().captain;
        const fixtures = await traceLineups(trace, captain);
        expect(fixtures.length).toBeGreaterThan(0);
        expect(Date.parse(fixtures[0]?.estimatedStartAt ?? '')).toBe(GAMES_START_MS);
        expect(fixtures.some((item) => item.teamAName !== null && item.teamBName !== null)).toBe(true);
        const played = await playAllMatches(trace, captain, fixtures);
        await finishHybridDay(trace, captain, played);
      } finally {
        trace.print();
        vi.useRealTimers();
      }
    });

    it('then runs the same field as dumb courts: tiers awarded, Results is the ledger', async () => {
      const trace = new ActorTrace(`dumb courts · ${size} teams`);
      try {
        const teamIds = teams.map((team) => team.id);
        const created = await deskPost('', {
          name: `Dumb day (${size} teams)`,
          kind: 'dumb_courts',
          winPoints: 0,
          drawPoints: 0,
          lossPoints: 0,
          teamIds,
          tiers: TIERS,
        });
        expect(created.tournament?.kind).toBe('dumb_courts');
        trace.act('SUPERADMIN superadmin', `creates a dumb-courts draft for the same ${size} teams with tiers ${TIERS.map((tier) => `${tier.label} ${tier.points}`).join(' / ')}`);
        const started = await deskPost('/activate', { dumb: true, matchMinutes: 12, changeoverMinutes: 3, restMinutes: 0 });
        trace.act('SUPERADMIN superadmin', 'presses Start — no stages, no fixtures, no line-ups are built');
        expect(started.tournament?.stages).toEqual([]);
        expect(started.tournament?.matches).toEqual([]);

        const courtId = courtIds[0] ?? '';
        const courtResponse = await ctx.app.request(`/api/tournament/dumb/courts/${courtId}`, { headers: marshal.headers });
        const court = (await courtResponse.json()) as DumbCourtView;
        trace.act(`FACILITATOR ${marshal.username}`, `opens Court 1 and sees ${court.tiers.length} tiers to arm and ${court.teams.length} teams to award`);
        expect(court.teams).toHaveLength(size);

        const captain = headliners().captain;
        const before = await participantTotals(captain);
        for (const team of teams) {
          const response = await ctx.app.request(
            `/api/tournament/dumb/courts/${courtId}/awards`,
            jsonRequest({ teamId: team.id, tierLabel: 'Played', clientAwardUuid: randomUUID() }, marshal.headers),
          );
          expect(response.status, await response.clone().text()).toBe(201);
          trace.act(`FACILITATOR ${marshal.username}`, `awards 'Played' (2 pts) to ${team.name}`);
        }
        const gold = await ctx.app.request(
          `/api/tournament/dumb/courts/${courtId}/awards`,
          jsonRequest({ teamId: headliners().id, tierLabel: 'Gold', clientAwardUuid: randomUUID() }, marshal.headers),
        );
        expect(gold.status, await gold.clone().text()).toBe(201);
        trace.act(`FACILITATOR ${marshal.username}`, `awards 'Gold' (10 pts) to ${headliners().name} on top`);

        const feed = await traceAwardResults(trace, captain);
        expect(feed.mode).toBe('dumb');
        expect(feed.items).toEqual([]);
        expect(feed.awards).toHaveLength(size + 1);
        for (const entry of feed.awards) {
          expect(`Team ${entry.teamName} is awarded ${entry.points} points!`).toMatch(/^Team .+ is awarded \d+ points!$/);
        }
        const lineups = await traceLineups(trace, captain);
        expect(lineups).toEqual([]);
        // ADR-337 — the tiers are the TEAM's points, sliced across its roster: 'Played' (2) on
        // every team plus 'Gold' (10) on the headliners is 12 for the team and 12 / roster for the
        // captain. Replicated, this was `before + 12` and a full roster multiplied it.
        const roster = headliners().members.length;
        expect(await participantTotals(captain)).toBeCloseTo(before + 12 / roster, 9);

        const courtAfter = (await (
          await ctx.app.request(`/api/tournament/dumb/courts/${courtId}`, { headers: marshal.headers })
        ).json()) as DumbCourtView;
        const goldAward = courtAfter.awards.find((award) => award.tierLabel === 'Gold' && !award.isVoided);
        if (goldAward === undefined) throw new Error('the gold award is missing from the court log');
        const undone = await ctx.app.request(`/api/tournament/dumb/awards/${goldAward.id}/void`, jsonRequest({}, marshal.headers));
        expect(undone.status, await undone.clone().text()).toBe(200);
        trace.act(`FACILITATOR ${marshal.username}`, `takes back the Gold award to ${headliners().name} inside the undo window`);
        expect(await participantTotals(captain)).toBeCloseTo(before + 2 / roster, 9);
        const feedAfter = await traceAwardResults(trace, captain);
        const struck = feedAfter.awards.find((entry) => entry.tierLabel === 'Gold');
        expect(struck?.isVoided).toBe(true);
        await deskPost('/close', { reason: null });
        trace.act('SUPERADMIN superadmin', 'closes the dumb tournament — the day is done');
      } finally {
        trace.print();
      }
    });

    it('interrupts a third day mid-stage: the switch drains the live match and pays every team once', async () => {
      const trace = new ActorTrace(`mid-stage switch · ${size} teams`);
      // Only the Date is faked, as above: the switch and its drain run on the match-day clock.
      // The third day runs a DAY LATER on that clock, because the room reads “the day it is
      // showing” as the last one closed by close time — a clock reset backwards between days
      // would hand the drain's reads to the first day's bracket.
      const NEXT_DAY_MS = GAMES_START_MS + 24 * 60 * MINUTE_MS;
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        await startHybridDay(trace, NEXT_DAY_MS);
        const captain = headliners().captain;

        // Play into the group stage until one match is done and another is still on court.
        const sim = newSimulation(NEXT_DAY_MS);
        setScenarioTime(sim, NEXT_DAY_MS);
        const stopped = await playUntilMidStage(sim, trace);
        const { live, finishedBefore, stageLabel: stageLabelAtSwitch } = stopped;
        if (live.length === 0) throw new Error('no match was on court at the switch');
        expect(finishedBefore).toBeGreaterThanOrEqual(1);
        expect(stageLabelAtSwitch).toBe('Group stage');

        // The desk switches the day mid-stage: the typed word, the reason, one clientUuid,
        // and no tiers of its own — the buttons must be the day's derived 30/20/10.
        const switchReason = 'The hall must close early; the courts will award the day.';
        const switched = await deskPost('/switch', { confirmation: 'switch', reason: switchReason, clientUuid: randomUUID() });
        trace.act('SUPERADMIN superadmin', `switches the day to court awards with ${live.length} match(es) still on court — “${switchReason}”`);
        expect(switched.mode).toBe('switching');
        expect(switched.modeSwitch?.fixturesEnded).toBe(false);
        expect(switched.modeSwitch?.tiers).toEqual([
          { label: '30 pts', points: 30 },
          { label: '20 pts', points: 20 },
          { label: '10 pts', points: 10 },
        ]);

        // A team still on court may not be paid, and the refusal names its court.
        const [onCourt] = teamIdsOf(live[0]!.match);
        const refused = await ctx.app.request(
          `/api/tournament/dumb/courts/${courtIds[0]}/awards`,
          jsonRequest({ teamId: onCourt, tierLabel: '10 pts', clientAwardUuid: randomUUID() }, marshal.headers),
        );
        const refusedText = await refused.clone().text();
        expect(refused.status, refusedText).toBe(409);
        expect(refusedText).toContain(`Court ${courtIds.indexOf(live[0]!.courtId) + 1}`);
        trace.act(`FACILITATOR ${marshal.username}`, `is refused an award for ${nameOf(onCourt)} — still on Court ${courtIds.indexOf(live[0]!.courtId) + 1}`);

        // The drain: every match on court runs to its own end; nothing is stranded.
        for (const match of live) {
          while (match.nextRally < match.rallies.length) {
            setScenarioTime(sim, match.nextRallyAtMs);
            await scoreNextRally(trace, match);
            match.nextRallyAtMs += match.rallyStepMs;
          }
          setScenarioTime(sim, match.endsAtMs);
          await finishLiveMatch(trace, match);
        }

        // The bracket ended itself the moment its last court finished — the desk clicked nothing.
        const view = await deskView();
        expect(view.mode).toBe('dumb');
        expect(view.modeSwitch?.fixturesEnded).toBe(true);
        // The retired bracket is named by the switch's own record: the table holds two
        // captains_ball days by now, and "first of the kind" would answer with the wrong one.
        const changes = await ctx.handle.db.select().from(tournamentModeChanges);
        const change = changes.sort((left, right) => right.switchedAt.getTime() - left.switchedAt.getTime())[0];
        const bracket = (await ctx.handle.db.select().from(tournaments)).find((row) => row.id === change?.fixturesTournamentId);
        expect(bracket?.status).toBe('closed');
        expect(bracket?.closeReason).toBe(switchReason);
        trace.act('SYSTEM', `the bracket closed itself when its last court finished — “${switchReason}”`);

        // Every team is paid once, at the court, through the same ledger a result writes to.
        const courtId = courtIds[0] ?? '';
        const beforeAwards = await participantTotals(captain);
        const awardUuids = new Map<string, string>();
        for (const team of teams) {
          const clientAwardUuid = randomUUID();
          awardUuids.set(team.id, clientAwardUuid);
          const response = await ctx.app.request(
            `/api/tournament/dumb/courts/${courtId}/awards`,
            jsonRequest({ teamId: team.id, tierLabel: '10 pts', clientAwardUuid }, marshal.headers),
          );
          expect(response.status, await response.clone().text()).toBe(201);
          trace.act(`FACILITATOR ${marshal.username}`, `awards '10 pts' (derived) to ${team.name}`);
        }
        // A retried press pays nobody twice: the same clientAwardUuid replays the court, not the award.
        const replay = await ctx.app.request(
          `/api/tournament/dumb/courts/${courtId}/awards`,
          jsonRequest({ teamId: teams[0]!.id, tierLabel: '10 pts', clientAwardUuid: awardUuids.get(teams[0]!.id) }, marshal.headers),
        );
        expect(replay.status, await replay.clone().text()).toBe(200);

        // Results keeps both halves: every finished match below the divider, every award above it.
        const feed = await participantFeed(captain);
        await traceResults(trace, captain);
        await traceAwardResults(trace, captain);
        expect(feed.mode).toBe('mixed');
        expect(feed.items).toHaveLength(finishedBefore + live.length);
        expect(feed.items.every((item) => item.status !== 'in_progress')).toBe(true);
        expect(feed.awards).toHaveLength(size);
        expect(new Set(feed.awards.map((entry) => entry.teamName)).size).toBe(size);
        // ADR-337 — the captain's own total moves by one 10-point share, exactly once.
        const roster = headliners().members.length;
        expect(await participantTotals(captain)).toBeCloseTo(beforeAwards + 10 / roster, 9);

        await deskPost('/close', { reason: null });
        trace.act('SUPERADMIN superadmin', 'closes the award day — the interrupted day is done');
      } finally {
        trace.print();
        vi.useRealTimers();
      }
    });
  });
}
