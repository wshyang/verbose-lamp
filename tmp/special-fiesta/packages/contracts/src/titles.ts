/**
 * ADR-061 — the energetic word every participant is called.
 *
 * A participant is not a "Trainer": each one is given one of these at sign-up and wears it for the
 * day. The catalogue lives here because both sides need it — the API seeds it into the database as a
 * fixed lookup table and picks from it, and the tests assert against the same list rather than a
 * copy of it. This is the `CLUSTER_CODES` pattern (ADR-007): a catalogue in code, a table in the
 * database, seeded at bootstrap, never runtime-editable.
 *
 * A hundred words. The list as first given had a hundred entries but only eighty-seven distinct
 * ones — Adventurer appeared three times, and Hustler, Jumper, Charger, Catalyst, Navigator,
 * Rambler, Roamer, Starter, Strider, Trekker and Motivator twice each — so thirteen more were
 * supplied to replace the duplicates. Order is the order they were given in.
 */
export const PARTICIPANT_TITLES = [
  'Activator', 'Mover', 'Challenger', 'Player', 'Dynamo', 'Explorer',
  'Striver', 'Thriver', 'Pacesetter', 'Playmaker', 'Energizer', 'Adventurer',
  'Pathfinder', 'Trailblazer', 'Goer', 'Starter', 'Achiever', 'Contender',
  'Rover', 'Strider', 'Stepper', 'Sprinter', 'Rambler', 'Trekker',
  'Charger', 'Jumper', 'Dasher', 'Racer', 'Seeker', 'Quester',
  'Voyager', 'Wayfarer', 'Navigator', 'Roamer', 'Hustler', 'Doer',
  'Driver', 'Spark', 'Catalyst', 'Mobilizer', 'Engager', 'Motivator',
  'Performer', 'Teammate', 'Contributor', 'Participant', 'Competitor', 'Gamechanger',
  'Pacekeeper', 'Bounder', 'Climber', 'Cruiser', 'Drifter', 'Forerunner',
  'Galloper', 'Glider', 'Hiker', 'Kicker', 'Leaper', 'Marcher',
  'Pacer', 'Pursuer', 'Roller', 'Scouter', 'Shaker', 'Skipper',
  'Swifter', 'Walker', 'Wanderer', 'Wheeler', 'Zinger', 'Booster',
  'Energist', 'Firestarter', 'GoGetter', 'Igniter', 'Impeller', 'Instigator',
  'Kinetist', 'Launcher', 'Propeller', 'Rallier', 'Sparkplug', 'Thruster',
  'Vitalizer', 'Wayfinder', 'Zestmaker', 'Pioneer', 'Ranger', 'Darter',
  'Balancer', 'Spinner', 'Finisher', 'Conqueror', 'Scorer', 'Joiner',
  'Partner', 'Motioneer', 'Pulsar', 'Vanguard',
] as const;

export type ParticipantTitle = (typeof PARTICIPANT_TITLES)[number];

/** Bounds the column's length check in `snapshot.sql`; the longest word today is 11 characters. */
export const PARTICIPANT_TITLE_MAX_LENGTH = 20;
