import { z } from "zod";
import { messages } from "./messages.js";

/**
 * ADR-248 — the award batch, on the wire. Its own file because `schemas.ts` had reached the length a
 * rule exists to notice: the batch is a new ledger surface with its own bounds, and the tournament's
 * request shapes should not have to grow a second screen for it. `createAdjustmentRequestSchema` reads
 * `awardAdjustmentPoints` from here, which is the point of naming it — the two ledgers cannot drift.
 */
/**
 * The points one row of either ledger may carry: signed, never zero, bounded so a slipped keypress
 * cannot decide the event. ADR-248 gives it a name rather than a copy, because a team award is the same
 * object with a team for a subject and the two bounds must not be able to drift apart.
 */
export const awardAdjustmentPoints = z
  .number()
  .int(messages.adjustmentPointsInvalid)
  .min(-100, messages.adjustmentPointsInvalid)
  .max(100, messages.adjustmentPointsInvalid)
  .refine((value) => value !== 0, messages.adjustmentPointsInvalid);

/**
 * ADR-336 — how many points is said out loud, once. A switched day names each award button after the
 * number it pays ("30 pts"), because a value merged from several stages has no source left to name;
 * the same string is what a station button and an award row print, so the two cannot spell it
 * differently. One point is singular.
 */
export function pointsLabel(points: number): string {
  return points === 1 ? "1 pt" : `${points} pts`;
}

/** How many rows one award batch may hold per ledger (ADR-248). A day's whole field fits, twice over. */
export const MAX_AWARD_BATCH_ROWS = 64;

/**
 * ADR-248 — posting a batch of team awards, and optionally manual adjustments, as one decision.
 *
 * `clientBatchUuid` is minted by the console before it posts, in `fringe_scan`'s idiom (ADR-009): the
 * failure a twenty-row write has to survive is a timeout after the inserts, and a retry of the same key
 * must be an acknowledgement rather than twenty more rows. There is deliberately no rule here about
 * awarding the same team twice — that freedom is the owner's decision (D7), and a repeat is the
 * preview's to show rather than this schema's to refuse. What stays is integrity: at least one row, the
 * two ledgers' own point bounds, and a label and reason long enough to be worth reading back in a year.
 */
export const awardBatchRequestSchema = z
  .object({
    clientBatchUuid: z.string().uuid(),
    label: z
      .string()
      .trim()
      .min(1, messages.awardBatchLabelInvalid)
      .max(40, messages.awardBatchLabelInvalid),
    // The same bounds as `reasonSchema` in `schemas.ts`, restated rather than imported: `schemas.ts`
    // imports this file for the point bounds, and a cycle between them is worse than two numbers that a
    // test below keeps honest. The message is shared, because "say why" is one rule with one wording.
    reason: z
      .string()
      .trim()
      .min(1, messages.voidReasonRequired)
      .max(200, messages.voidReasonRequired),
    teams: z
      .array(
        z.object({ teamId: z.string().uuid(), points: awardAdjustmentPoints }),
      )
      .max(MAX_AWARD_BATCH_ROWS, messages.awardBatchTooLarge)
      .default([]),
    participants: z
      .array(
        z.object({
          participantId: z.string().uuid(),
          // The participant ledger keeps its own shape rather than being relaxed for the batch: every
          // row of it names the station the award belongs to, which is what makes its activity-name
          // snapshot a snapshot of something.
          activityId: z.string().uuid(),
          points: awardAdjustmentPoints,
        }),
      )
      .max(MAX_AWARD_BATCH_ROWS, messages.awardBatchTooLarge)
      .default([]),
  })
  .refine((batch) => batch.teams.length + batch.participants.length > 0, {
    message: messages.awardBatchEmpty,
  });

/*
 * Reversing a batch asks for a reason and nothing else, which is what `voidRequestSchema` in `schemas.ts`
 * already is. The route takes that one; a second schema spelling the same body would be a second opinion
 * about a rule the correction desk has had since ADR-031.
 */

/** The batch as posted, typed for the route that resolves its ids (`schemas.ts` does the same for its own). */
export type AwardBatchRequest = z.infer<typeof awardBatchRequestSchema>;
