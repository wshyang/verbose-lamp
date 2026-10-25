/**
 * ADR-019 — the surface the actor is on, remembered across a reload.
 *
 * Every surface has its own URL, so a browser that keeps its address bar restores the right
 * page by itself. Two things on event day do not: a phone that drops the tab under memory
 * pressure and reopens the app at its start URL, and an embedded frame whose container
 * re-mounts it at `src`. Both land on "/" and lose the facilitator's court or the
 * participant's board, mid-event, mid-queue.
 *
 * So the path is written down as it changes and read back when — and only when — the app
 * boots at the root with a live session.
 */

import { readItem, removeItem, writeItem } from '../storage/localStore.js';

const LAST_PATH_KEY = 'psd.lastPath.v1';

export function readLastPath(): string | null {
  return readItem(LAST_PATH_KEY);
}

export function writeLastPath(path: string): void {
  writeItem(LAST_PATH_KEY, path);
}

/** Signing out ends the trail too — the next person on this phone starts at the front door. */
export function forgetLastPath(): void {
  removeItem(LAST_PATH_KEY);
}
