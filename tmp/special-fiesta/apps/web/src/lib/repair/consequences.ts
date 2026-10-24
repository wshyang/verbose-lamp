import type { TeamRepairContext, WithdrawalView } from '../api/admin.js';

/**
 * ADR-154 — the sentences a roster repair says before and after it happens.
 *
 * Pure, and in their own module, for the reason ADR-149's capacity sentence is: the
 * documentation of a consequence belongs at the point of decision, not in a file nobody
 * reads — and a sentence that is assembled inside a component is a sentence no test can
 * check without rendering a page. Every one of these is the *whole* of what the superadmin
 * is told, so each is worth pinning on its own.
 */

/**
 * §3 — the hole in ADR-005, said out loud.
 *
 * The roster snapshot is taken at COMPLETION, not at start, so moving somebody out of a live
 * match means they are not credited for a match they actually played. That is reachable today
 * with no staff involvement and closing it properly is separate work. What this tool will not
 * do is let a superadmin walk into it unknowingly.
 *
 * Null when the team is not on court — an absent warning, not an empty one, so a caller
 * cannot accidentally render a blank line where a warning belongs.
 */
export function liveMatchWarning(
  context: TeamRepairContext,
  memberName: string,
): string | null {
  if (context.liveMatchCourtName === null) return null;
  return (
    `${context.teamName} are on ${context.liveMatchCourtName} right now. ` +
    `If you move ${memberName} before that match is completed, ` +
    `they will not be credited for it.`
  );
}

/**
 * §6 — `invalidateMembership` auto-promotes the earliest-joined survivor, and disbands the
 * team when there are none. That cascade is correct, but inheriting it *silently* from a staff
 * action is not: a superadmin removing a lone captain would otherwise disband their team with
 * no warning. The outcome is named before it happens.
 */
export function removalConsequence(context: TeamRepairContext, memberName: string): string {
  if (context.memberCount <= 1) {
    return (
      `${memberName} is the only member. Removing them disbands ${context.teamName}, ` +
      `and any of their unplayed fixtures will be removed from the schedule.`
    );
  }
  return `${memberName} will be removed from ${context.teamName}.`;
}

/** The same warning, for a move: emptying a team by moving its last member out withdraws it. */
export function moveConsequence(
  context: TeamRepairContext,
  memberName: string,
  toTeamName: string,
): string {
  const base = `${memberName} will be moved to ${toTeamName}.`;
  if (context.memberCount > 1) return base;
  return (
    `${base} They are the only member, so this also disbands ${context.teamName} ` +
    `and removes any of their unplayed fixtures from the schedule.`
  );
}

/**
 * §7, after the fact — what the withdrawal did to everybody else's day.
 *
 * The asymmetry is named rather than hidden. Played results stand because they happened and
 * the snapshots already paid them; the unplayed ones are skipped rather than awarded as
 * walkovers, because ADR-149 ranks on absolute wins and a free win would feed straight into
 * the qualification race. The cost of that choice is that somebody plays fewer matches than
 * their neighbours, and this sentence is where they are told so.
 *
 * Null when nothing was scheduled — "and no fixtures were affected" is noise.
 */
export function withdrawalNotice(
  withdrawal: WithdrawalView,
  teamName: string,
  nameOf: (teamId: string) => string,
): string | null {
  const total = withdrawal.playedCount + withdrawal.skippedCount;
  if (total === 0) return null;
  const played =
    withdrawal.playedCount === 0
      ? ''
      : ` ${withdrawal.playedCount} of their ${total} fixtures had been played; those results stand.`;
  if (withdrawal.skippedCount === 0) return `${teamName} withdrew.${played}`;
  const affected = [...new Set(withdrawal.affectedTeamIds.map(nameOf))].join(', ');
  const remaining =
    withdrawal.skippedCount === 1
      ? 'The remaining 1 has been removed'
      : `The remaining ${withdrawal.skippedCount} have been removed`;
  return `${teamName} withdrew.${played} ${remaining}, so ${affected} play fewer group matches.`;
}
