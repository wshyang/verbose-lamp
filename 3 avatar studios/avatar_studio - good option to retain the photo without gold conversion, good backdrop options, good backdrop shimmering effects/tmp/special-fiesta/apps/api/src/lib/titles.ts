import { PARTICIPANT_TITLES } from '@psd/contracts';

/**
 * ADR-061 — pick the energetic word a new participant will wear.
 *
 * Uniform over the whole catalogue, and deliberately **not** unique per participant. With a hundred
 * words and hundreds of participants expected, "unique" would either exhaust the pool or start
 * handing out second choices; and two Pathfinders in different clusters is a coincidence people
 * enjoy, not a defect. The nickname is what identifies somebody (`ux_participant_nickname_lower`).
 */
export function randomParticipantTitle(): string {
  const at = Math.floor(Math.random() * PARTICIPANT_TITLES.length);
  // `??` rather than a non-null assertion: an out-of-range read is impossible here, but
  // `noUncheckedIndexedAccess` still wants it spelled out.
  return PARTICIPANT_TITLES[at] ?? PARTICIPANT_TITLES[0];
}
