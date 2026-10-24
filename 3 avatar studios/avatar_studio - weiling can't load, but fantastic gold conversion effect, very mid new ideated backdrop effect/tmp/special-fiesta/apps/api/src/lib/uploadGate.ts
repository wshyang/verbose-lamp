import { getEnv, resolveDriver } from '../env.js';

/**
 * ADR-324 — how many photo uploads the process will handle at once.
 *
 * Under the embedded database every query runs synchronously on the main thread, and a 12 MB
 * original is hex-encoded in JavaScript on the way in: measured at 1.1 s of blocked event loop and
 * a 1.1 GB heap peak for one. A burst of them is a stalled app for everyone, or a heap that cannot
 * be caught when it runs out. So there is a small number of slots; a request that cannot get one is
 * told to try again (503) BEFORE its body is read, which is the whole point — buffering it first
 * would spend the memory the gate exists to protect.
 *
 * Against a real Postgres server the encode happens in a driver, not on this thread, so the limit
 * is higher; the number is a ceiling on in-flight bodies, not a throughput target.
 */

const PGLITE_SLOTS = 1;
const POSTGRES_SLOTS = 4;

export type Release = () => void;

export interface UploadGate {
  /** A release function if a slot was free, `null` if not. The release is idempotent. */
  tryEnter: () => Release | null;
}

export function createUploadGate(options: { limit: number }): UploadGate {
  let inFlight = 0;
  return {
    tryEnter: () => {
      if (inFlight >= options.limit) return null;
      inFlight += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        inFlight -= 1;
      };
    },
  };
}

let shared: UploadGate | null = null;

/** The process-wide gate, sized for the database driver in use. */
export function uploadGate(): UploadGate {
  if (shared === null) {
    const slots = resolveDriver(getEnv()) === 'postgres' ? POSTGRES_SLOTS : PGLITE_SLOTS;
    shared = createUploadGate({ limit: slots });
  }
  return shared;
}

export function resetUploadGateForTests(): void {
  shared = null;
}
