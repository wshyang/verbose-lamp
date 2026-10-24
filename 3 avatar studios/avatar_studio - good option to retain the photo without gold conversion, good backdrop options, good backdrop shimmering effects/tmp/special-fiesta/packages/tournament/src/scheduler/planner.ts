/**
 * ADR-274 — the planner: which match goes on which court, when (requirements 7 and 8).
 *
 * Pure and deterministic: the same input always plans the same day, so the console, the hall
 * screen and the browser simulator all see one timetable. Times are minutes on a shared clock
 * (the adapter converts instants), and nothing here reads a clock of its own.
 *
 * List scheduling in priority order (each match's `priority`, which the adapter sets from stage,
 * round and sequence so groups interleave). A match is ready once every match it depends on has
 * ended plus the changeover, every known team in it has rested, and the clock has reached `now`.
 * It takes the court that can host it earliest, back-filling any gap that fits. Matches whose
 * teams are not known yet are still placed — as forecasts — so the day can be read end to end
 * (P-11's "progression fixtures exist as forecasts").
 *
 * The calendar below is built and updated inside one call and never escapes it.
 */

export interface PlanCourt {
  id: string;
  label: string;
}

export interface PlanMatch {
  id: string;
  priority: number;
  /** Teams known now (seated or resolved); unknown seats are null. */
  entrants: readonly (string | null)[];
  /** Matches that must end first. */
  dependsOn: readonly string[];
  /** The direct winner/loser feeders: whoever comes out of them plays here. */
  feeders?: readonly string[];
  minutes: number;
}

export interface FixedPlacement {
  matchId: string;
  courtId: string;
  start: number;
  end: number;
  entrants: readonly (string | null)[];
}

export interface PlanInput {
  now: number;
  courts: readonly PlanCourt[];
  /** Matches still to play, unpinned. */
  matches: readonly PlanMatch[];
  /** Live matches and human-pinned placements: they hold their court and time. */
  fixed: readonly FixedPlacement[];
  /** End times of matches already finished, so dependents and rest can be measured. */
  finished: readonly { matchId: string; end: number; entrants: readonly (string | null)[] }[];
  changeoverMinutes: number;
  restMinutes: number;
  deadline: number | null;
  /** The first unstarted match per court in the previous plan: kept on its court where possible. */
  previousNext?: readonly { courtId: string; matchId: string }[];
}

export interface Placement {
  matchId: string;
  courtId: string;
  start: number;
  end: number;
  /** A team here gets no rest beyond the changeover: it walks straight off one match onto this one. */
  isBackToBack: boolean;
}

export interface FitSummary {
  remainingMatches: number;
  courtMinutes: number;
  projectedFinish: number | null;
  fitsDeadline: boolean | null;
  overrunMinutes: number;
}

export interface PlanResult {
  placements: Placement[];
  fit: FitSummary;
}

interface Busy {
  start: number;
  end: number;
}

interface Calendar {
  courts: Map<string, Busy[]>;
  teamFreeAt: Map<string, number>;
  teamLastEnd: Map<string, number>;
  matchEnd: Map<string, number>;
}

interface Occupied {
  matchId: string;
  end: number;
  entrants: readonly (string | null)[];
}

function occupy(calendar: Calendar, input: { row: Occupied; restMinutes: number }): void {
  calendar.matchEnd.set(input.row.matchId, input.row.end);
  for (const entrant of input.row.entrants) {
    if (entrant === null) continue;
    calendar.teamLastEnd.set(entrant, Math.max(calendar.teamLastEnd.get(entrant) ?? -Infinity, input.row.end));
    calendar.teamFreeAt.set(entrant, Math.max(calendar.teamFreeAt.get(entrant) ?? -Infinity, input.row.end + input.restMinutes));
  }
}

function seed(input: PlanInput): Calendar {
  const calendar: Calendar = {
    courts: new Map(input.courts.map((court) => [court.id, []])),
    teamFreeAt: new Map(),
    teamLastEnd: new Map(),
    matchEnd: new Map(),
  };
  for (const row of input.finished) occupy(calendar, { row, restMinutes: input.restMinutes });
  for (const row of input.fixed) {
    occupy(calendar, { row, restMinutes: input.restMinutes });
    calendar.courts.get(row.courtId)?.push({ start: row.start, end: row.end + input.changeoverMinutes });
  }
  return calendar;
}

function readyAt(match: PlanMatch, input: { calendar: Calendar; now: number; changeover: number }): number | null {
  let ready = input.now;
  for (const dependency of match.dependsOn) {
    const end = input.calendar.matchEnd.get(dependency);
    if (end === undefined) return null;
    ready = Math.max(ready, end + input.changeover);
  }
  for (const entrant of match.entrants) {
    if (entrant !== null) ready = Math.max(ready, input.calendar.teamFreeAt.get(entrant) ?? -Infinity);
  }
  return ready;
}

/** The earliest start at or after `from` where a block of `length` fits on this court. */
function earliestGap(busy: readonly Busy[], input: { from: number; length: number }): number {
  let start = input.from;
  for (const block of [...busy].sort((left, right) => left.start - right.start)) {
    if (start + input.length <= block.start) return start;
    start = Math.max(start, block.end);
  }
  return start;
}

interface CourtChoice {
  courtId: string;
  start: number;
}

function chooseCourt(
  calendar: Calendar,
  input: { courts: readonly PlanCourt[]; from: number; length: number; preferred: string | null },
): CourtChoice | null {
  let best: CourtChoice | null = null;
  for (const court of input.courts) {
    const start = earliestGap(calendar.courts.get(court.id) ?? [], { from: input.from, length: input.length });
    const isBetter = best === null || start < best.start || (start === best.start && court.id === input.preferred);
    if (isBetter) best = { courtId: court.id, start };
  }
  return best;
}

function preferredCourts(input: PlanInput): Map<string, string> {
  const enabled = new Set(input.courts.map((court) => court.id));
  const kept = (input.previousNext ?? []).filter((row) => enabled.has(row.courtId));
  return new Map(kept.map((row) => [row.matchId, row.courtId]));
}

function isWithoutRest(calendar: Calendar, input: { match: PlanMatch; start: number; changeover: number }): boolean {
  const restless = (end: number | undefined) => end !== undefined && input.start - end <= input.changeover;
  const knownTeam = input.match.entrants.some((entrant) => entrant !== null && restless(calendar.teamLastEnd.get(entrant)));
  return knownTeam || (input.match.feeders ?? []).some((feeder) => restless(calendar.matchEnd.get(feeder)));
}

function place(calendar: Calendar, input: { match: PlanMatch; choice: CourtChoice; plan: PlanInput }): Placement {
  const { match, choice } = input;
  const end = choice.start + match.minutes;
  const isBackToBack = isWithoutRest(calendar, { match, start: choice.start, changeover: input.plan.changeoverMinutes });
  calendar.courts.get(choice.courtId)?.push({ start: choice.start, end: end + input.plan.changeoverMinutes });
  calendar.matchEnd.set(match.id, end);
  for (const entrant of match.entrants) {
    if (entrant === null) continue;
    calendar.teamLastEnd.set(entrant, end);
    calendar.teamFreeAt.set(entrant, end + input.plan.restMinutes);
  }
  return { matchId: match.id, courtId: choice.courtId, start: choice.start, end, isBackToBack };
}

function fitOf(input: PlanInput, placements: readonly Placement[]): FitSummary {
  const ends = [...placements.map((row) => row.end), ...input.fixed.map((row) => row.end)];
  const projectedFinish = ends.length === 0 ? null : Math.max(...ends);
  const courtMinutes = input.matches.reduce((total, match) => total + match.minutes, 0);
  const base = { remainingMatches: input.matches.length, courtMinutes, projectedFinish };
  if (input.deadline === null || projectedFinish === null) return { ...base, fitsDeadline: null, overrunMinutes: 0 };
  const overrun = Math.max(0, projectedFinish - input.deadline);
  return { ...base, fitsDeadline: overrun === 0, overrunMinutes: overrun };
}

function nextPlaceable(calendar: Calendar, input: { pending: readonly PlanMatch[]; plan: PlanInput; preferred: Map<string, string> }): { index: number; choice: CourtChoice } | null {
  for (let index = 0; index < input.pending.length; index += 1) {
    const match = input.pending[index] as PlanMatch;
    const from = readyAt(match, { calendar, now: input.plan.now, changeover: input.plan.changeoverMinutes });
    if (from === null) continue;
    const choice = chooseCourt(calendar, {
      courts: input.plan.courts,
      from,
      length: match.minutes + input.plan.changeoverMinutes,
      preferred: input.preferred.get(match.id) ?? null,
    });
    if (choice !== null) return { index, choice };
  }
  return null;
}

/**
 * Plans every match it can. A match whose dependencies cannot be placed (a court-less day, or a
 * dependency outside the plan that has not finished) is left unplaced rather than invented.
 */
export function plan(input: PlanInput): PlanResult {
  const calendar = seed(input);
  const preferred = preferredCourts(input);
  let pending = [...input.matches].sort((left, right) => left.priority - right.priority);
  const placements: Placement[] = [];
  for (;;) {
    const next = nextPlaceable(calendar, { pending, plan: input, preferred });
    if (next === null) break;
    const match = pending[next.index] as PlanMatch;
    placements.push(place(calendar, { match, choice: next.choice, plan: input }));
    pending = [...pending.slice(0, next.index), ...pending.slice(next.index + 1)];
  }
  return { placements, fit: fitOf(input, placements) };
}

export interface PlacementChange {
  matchId: string;
  kind: 'added' | 'removed' | 'moved';
  from: { courtId: string; start: number } | null;
  to: { courtId: string; start: number } | null;
}

type Placed = { matchId: string; courtId: string; start: number };

/** What a re-plan would disturb, said out loud before it is applied (P-14). */
export function diffPlacements(before: readonly Placed[], after: readonly Placed[]): PlacementChange[] {
  const old = new Map(before.map((row) => [row.matchId, row]));
  const fresh = new Map(after.map((row) => [row.matchId, row]));
  const changes: PlacementChange[] = [];
  for (const [matchId, row] of fresh) {
    const was = old.get(matchId);
    const to = { courtId: row.courtId, start: row.start };
    if (was === undefined) changes.push({ matchId, kind: 'added', from: null, to });
    else if (was.courtId !== row.courtId || was.start !== row.start) {
      changes.push({ matchId, kind: 'moved', from: { courtId: was.courtId, start: was.start }, to });
    }
  }
  for (const [matchId, was] of old) {
    if (!fresh.has(matchId)) changes.push({ matchId, kind: 'removed', from: { courtId: was.courtId, start: was.start }, to: null });
  }
  return changes;
}
