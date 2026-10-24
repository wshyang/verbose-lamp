import { readFileSync } from 'node:fs';
import { createTeam, jsonRequest, type ParticipantSession, type TestContext } from '../harness.js';

/**
 * ADR-326 — the demo day (ADR-314) as test seed. The crowd and the team table are NOT
 * re-typed here: the crowd is the recorded dump plus the supplemental sign-ups, and the
 * twelve Kallang teams with their roster segments are `scripts/demo-team-plan.json` — the
 * same file `scripts/seed-demo.mjs` builds the demo day from, so a suite that replays the
 * day at seven to twelve teams cannot drift from the day itself. Sign-ups happen through
 * the app's own routes, in sign-up order, PIN 1000 throughout — the generator's path,
 * minus the recorded photo sprites (a drawn avatar makes no difference to a tournament).
 */

interface DumpParticipant {
  nickname: string;
  gender: 'male' | 'female';
  avatarVariant: number;
  avatarLook: string;
}

interface DemoPlan {
  completeTeamMin: number;
  clusterSignups: [string, number][];
  teams: { name: string; segments: [string, number][] }[];
}

const ROOT = new URL('../../../../../', import.meta.url);

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, ROOT), 'utf8')) as T;
}

export function loadDemoPlan(): DemoPlan {
  return readJson<DemoPlan>('scripts/demo-team-plan.json');
}

function loadCrowd(): DumpParticipant[] {
  const dump = readJson<{ participants: DumpParticipant[] }>('scripts/demo-participants.dump.json');
  const supplemental = readJson<{ participants: DumpParticipant[] }>(
    'scripts/demo-supplemental-participants.json',
  );
  return [...dump.participants, ...supplemental.participants];
}

/** One cluster code per sign-up position (135) — `buildSignupClusters` in the generator. */
export function demoSignupClusters(plan: DemoPlan): string[] {
  const roster = plan.teams.flatMap((team) =>
    team.segments.flatMap(([cluster, count]) => Array<string>(count).fill(cluster)),
  );
  const rosterCounts = new Map<string, number>();
  for (const cluster of roster) rosterCounts.set(cluster, (rosterCounts.get(cluster) ?? 0) + 1);
  const others: string[] = [];
  const openSlots = 135 - roster.length;
  for (const [cluster, total] of plan.clusterSignups) {
    const missing = Math.max(0, total - (rosterCounts.get(cluster) ?? 0));
    for (let index = 0; index < missing && others.length < openSlots; index += 1) {
      others.push(cluster);
    }
    if (others.length >= openSlots) break;
  }
  return [...roster, ...others];
}

export interface DemoTeam {
  id: string;
  name: string;
  captain: ParticipantSession;
  members: ParticipantSession[];
}

/**
 * Signs up exactly the rostered crowd the first `teamCount` demo teams need (in sign-up
 * order, which is roster order) and builds those teams through the API: the captain
 * creates, the rest join with the team's code. Returns the teams in demo order.
 */
export async function seedDemoTeams(ctx: TestContext, teamCount: number): Promise<DemoTeam[]> {
  const plan = loadDemoPlan();
  const crowd = loadCrowd();
  const clusters = demoSignupClusters(plan);
  const wanted = plan.teams.slice(0, teamCount);
  const rosterSize = wanted.reduce(
    (total, team) => total + team.segments.reduce((sum, [, count]) => sum + count, 0),
    0,
  );
  const people: ParticipantSession[] = [];
  for (let index = 0; index < rosterSize; index += 1) {
    const row = crowd[index];
    if (row === undefined) throw new Error(`demo crowd ran out at position ${index + 1}`);
    people.push(
      await ctx.signUpParticipant({
        nickname: row.nickname,
        pin: '1000',
        clusterCode: clusters[index] ?? 'ServiceSG',
        gender: row.gender,
        avatarVariant: row.avatarVariant,
        avatarLook: row.avatarLook,
      }),
    );
  }
  const teams: DemoTeam[] = [];
  let at = 0;
  for (const teamPlan of wanted) {
    const size = teamPlan.segments.reduce((sum, [, count]) => sum + count, 0);
    const members = people.slice(at, at + size);
    at += size;
    const captain = members[0];
    if (captain === undefined) throw new Error(`demo team ${teamPlan.name} has no captain`);
    const id = await createTeam(ctx, captain, teamPlan.name);
    for (const member of members.slice(1)) await joinTeam(ctx, member, { teamId: id, captain });
    teams.push({ id, name: teamPlan.name, captain, members });
  }
  return teams;
}

async function joinTeam(
  ctx: TestContext,
  member: ParticipantSession,
  input: { teamId: string; captain: ParticipantSession },
): Promise<void> {
  const detail = await ctx.app.request(`/api/teams/${input.teamId}`, { headers: input.captain.headers });
  const { team } = (await detail.json()) as { team: { joinCode: string } };
  const joined = await ctx.app.request('/api/teams/join', jsonRequest({ joinCode: team.joinCode }, member.headers));
  if (joined.status !== 201) throw new Error(`demo join failed: ${await joined.text()}`);
}

/**
 * The size-loop suite's narration: every action by every actor, in order, printed at the
 * end of the scenario so a human can read the day the suite just played. Assertions stand
 * on the API's answers; this is the telling of it, kept so that a failing line can be
 * found in the story as well as in the state.
 */
export class ActorTrace {
  private stepNo = 0;
  readonly lines: string[] = [];

  constructor(private readonly title: string) {}

  act(actor: string, text: string): void {
    this.stepNo += 1;
    this.lines.push(`${String(this.stepNo).padStart(3, ' ')} · ${actor} — ${text}`);
  }

  print(): void {
    console.log(`\n===== ACTOR TRACE · ${this.title} =====\n${this.lines.join('\n')}\n===== END · ${this.title} =====`);
  }
}
