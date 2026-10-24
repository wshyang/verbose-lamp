import { CHOP_DIE_IDS, type ChopDieId } from './chopDies.js';

/**
 * ADR-242 — which die a station is struck with.
 *
 * A passport does not ask each page which design it would like: the office at the counter holds
 * one die, and everybody who walks through it is marked with that one. The same holds here — the
 * die belongs to the station, so two participants comparing phones see the same shape at the same
 * station, and the impression still differs from device to device because that is drawn from the
 * device's own seed (ADR-240).
 *
 * The choice is a hash of the station's id, not a row anywhere. It is derived on read, it survives
 * a station being renamed, and it cannot drift out of step with a list that changed this morning.
 */

/** FNV-1a, 32-bit: short, total, and it does not need a second module to run. */
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

export function hash32(value: string): number {
  let hash = FNV_OFFSET;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

export function dieForStation(stationId: string): ChopDieId {
  return CHOP_DIE_IDS[hash32(stationId) % CHOP_DIE_IDS.length] as ChopDieId;
}
