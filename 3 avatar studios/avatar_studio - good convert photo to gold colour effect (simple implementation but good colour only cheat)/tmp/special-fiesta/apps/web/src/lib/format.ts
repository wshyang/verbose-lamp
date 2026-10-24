import { TEAM_CHAT_TYPING_NAMES_MAX } from '@psd/contracts';
import type { AwardTier } from '@psd/contracts';
/**
 * Formatting helpers. JSX may not build dates or numbers inline (AGENTS-frontend.md §2),
 * so every human-readable string is produced here and unit-testable without rendering.
 */

const TIME_FORMAT = new Intl.DateTimeFormat('en-SG', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('en-SG', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * Nicknames may not contain spaces (fds.md §2.1), and on a phone the space bar is the
 * biggest key on the keyboard. Rather than reject "Ah Seng" after the fact, every space
 * typed or pasted into a nickname field becomes the underscore the participant meant. One
 * character in, one character out, so the caret does not jump.
 */
export function asNickname(value: string): string {
  return value.replace(/\s/g, '_');
}

export function formatTime(isoTimestamp: string): string {
  return TIME_FORMAT.format(new Date(isoTimestamp));
}

export function formatDateTime(isoTimestamp: string): string {
  return DATE_TIME_FORMAT.format(new Date(isoTimestamp));
}

/**
 * ADR-342 — how long an ask has waited on the desk. The ask never expires, so its age is the one
 * number that says how current the question is: "moments" needs no hurry, "2 hours" deserves a walk
 * to the court before confirming. Coarse on purpose — the desk reads a room, not a stopwatch.
 */
export function formatAge(
  isoTimestamp: string,
  now: number = Date.now(),
): string {
  const minutes = Math.floor(
    Math.max(0, now - new Date(isoTimestamp).getTime()) / 60_000,
  );
  if (minutes < 1) return "moments";
  if (minutes < 60) return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hoursLabel = hours === 1 ? "1 hour" : `${hours} hours`;
  return rest === 0 ? hoursLabel : `${hoursLabel} ${rest} minutes`;
}

/**
 * ADR-337 — a team award belongs to the team, and each member of its frozen roster holds a share of
 * it (`points / roster size`). The arithmetic is exact everywhere: the ledger stores whole points,
 * the aggregate collapses to six decimals so ordering is not decided by float noise, and nothing
 * ever adds up two displayed numbers.
 *
 * The paint is where it becomes whole, and it must ROUND rather than truncate. A team of seven
 * slicing 100 holds 14.285714… each; summed back seven times that is 99.99999999999999, so a cluster
 * that earned exactly 100 would be painted as 99 by truncation. Math.round paints it 100.
 */
export function roundPoints(points: number): number {
  return Math.round(points);
}

export function formatPoints(points: number): string {
  const whole = roundPoints(points);
  return `${whole} pt${whole === 1 ? '' : 's'}`;
}

export function formatRankLabel(rank: number): string {
  return `#${rank}`;
}

/** fds.md §6.5 F27 — "✓ [Nickname] +[N] pts", with the queued variant for offline scans. */
export function scanConfirmation(input: {
  nickname: string;
  points: number;
  isQueued: boolean;
  tierLabel?: string | undefined;
}): string {
  const tierBit = input.tierLabel ? ` · ${input.tierLabel}` : '';
  const base = `✓ ${input.nickname} +${input.points} pts${tierBit}`;
  return input.isQueued ? `${base} (queued)` : base;
}

/**
 * ADR-092 — the station header's one-line answer to "what does a scan pay here?".
 * A single tier reads exactly as the flat rate always did; a tiered station lists them.
 */
export function tierSummary(tiers: AwardTier[]): string {
  return tiers
    .map((tier) =>
      tiers.length === 1 ? `${tier.points} points per scan` : `${tier.label} +${tier.points}`,
    )
    .join(' · ');
}

/**
 * ADR-336 §4 — a tier button says its name and what it pays, once.
 *
 * A derived tier is *named* by its number ("30 pts"), so the old `label · points pts` line read
 * "30 pts · 30 pts" on every button of a switched day. A named tier keeps both halves; a tier whose
 * label already carries its points shows only the label.
 */
export function tierButtonLine(tier: AwardTier): string {
  const points = `${tier.points} pts`;
  return tier.label.toLowerCase().includes(points)
    ? tier.label
    : `${tier.label} · ${points}`;
}

/**
 * ADR-156 — one line for a match, in three shapes rather than two.
 *
 * Before draws scored, a null winner meant "not finished", so "A vs B" was the whole of the
 * unfinished case. ADR-152 gave a null winner a second meaning, and a completed draw then
 * rendered identically to a match still being played — the feed row said "A vs B" whether
 * the teams were on court or had walked off level an hour ago. The status is what separates
 * them, so the status is now an argument: nothing else at the call site can tell them apart.
 *
 * "drew with" rather than "A 2 - 2 B" because this line is the verb and the score sits
 * beside it; a line that repeated the score would disagree with its neighbour the moment a
 * correction landed.
 */
export function matchResultLine(input: {
  teamAName: string;
  teamBName: string;
  winnerTeamName: string | null;
  status: string;
}): string {
  if (input.winnerTeamName) {
    return `${input.winnerTeamName} beat ${
      input.winnerTeamName === input.teamAName ? input.teamBName : input.teamAName
    }`;
  }
  if (input.status === 'completed') return `${input.teamAName} drew with ${input.teamBName}`;
  return `${input.teamAName} vs ${input.teamBName}`;
}

/**
 * ADR-146 — "Meera is typing…", and the point at which a list of names stops being useful.
 *
 * Up to `TEAM_CHAT_TYPING_NAMES_MAX` people are named; beyond that the room is told how many
 * there are instead. A team is about five people, so two names is where a list becomes a
 * crowd — and the threshold is a constant precisely so that judgement costs one number to
 * revisit rather than a rewrite of this function.
 *
 * The empty case returns an empty string rather than `null` so the caller can render a line
 * that is always present and sometimes blank. A line that appears and disappears shoves the
 * message list up and down under the eyes of whoever is reading it.
 */
export function typingLine(labels: readonly string[]): string {
  if (labels.length === 0) return '';
  if (labels.length > TEAM_CHAT_TYPING_NAMES_MAX) return `${labels.length} people are typing…`;
  if (labels.length === 1) return `${labels[0]} is typing…`;
  // No Oxford comma question to answer: at this length it reads as a sentence either way.
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]} are typing…`;
}
