import type { FormatId, FormatPlugin } from '../types.js';
import { ironmanFormat, openFormat, roundRobinFormat, singleEliminationFormat } from './basic.js';
import { consolationFormat, doubleEliminationFormat } from './brackets.js';
import { flightedQuadsFormat, groupsKnockoutFormat, pointsRushFormat } from './groups.js';
import { swissFormat } from './swiss.js';

/** ADR-274 — every format, registered once. The order is the order the setup form offers them in. */
export const FORMATS: readonly FormatPlugin[] = [
  openFormat,
  roundRobinFormat,
  groupsKnockoutFormat,
  singleEliminationFormat,
  doubleEliminationFormat,
  consolationFormat,
  swissFormat,
  flightedQuadsFormat,
  ironmanFormat,
  pointsRushFormat,
];

export function findFormat(id: string): FormatPlugin | null {
  return FORMATS.find((format) => format.id === id) ?? null;
}

export function isFormatId(id: string): id is FormatId {
  return findFormat(id) !== null;
}

export { planNextSwissRound, pairWithoutRematch, pairKey, defaultSwissRounds } from './swiss.js';
export type { SwissRoundPlan } from './swiss.js';
