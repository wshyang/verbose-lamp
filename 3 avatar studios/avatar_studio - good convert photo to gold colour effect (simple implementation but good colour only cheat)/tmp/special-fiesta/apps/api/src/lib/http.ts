import { createHash } from 'node:crypto';
import type { Context } from 'hono';
import type { TypeOf, ZodTypeAny } from 'zod';
import { messages } from '@psd/contracts';
import { firstOrThrow, required } from '../db/rows.js';

/**
 * One error shape for the whole API. Routes throw; `app.onError` renders.
 * Keeping failures as throws is what lets route bodies stay at guard-clause length
 * (AGENTS-function-design.md §2).
 */
export class HttpError extends Error {
  readonly status: number;
  readonly field: string | undefined;

  constructor(status: number, message: string, field?: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.field = field;
  }
}

export function badRequest(message: string, field?: string): HttpError {
  return new HttpError(400, message, field);
}

export function unauthorized(message: string = messages.signInRequired): HttpError {
  return new HttpError(401, message);
}

export function forbidden(message: string = messages.forbidden): HttpError {
  return new HttpError(403, message);
}

export function notFound(message: string = messages.notFound): HttpError {
  return new HttpError(404, message);
}

export function conflict(message: string, field?: string): HttpError {
  return new HttpError(409, message, field);
}

/** Validates against the shared contract; the message a user sees comes from @psd/contracts. */
export async function readBody<S extends ZodTypeAny>(c: Context, schema: S): Promise<TypeOf<S>> {
  const raw = await c.req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const issue = firstOrThrow(parsed.error.issues, 'Validation failure');
  throw badRequest(issue.message, issue.path.join('.'));
}

/** Hono types a dynamic param as possibly-undefined; a matched route always supplies it. */
export function requireParam(c: Context, name: string): string {
  return required(c.req.param(name), `Route parameter ${name}`);
}

export function iso(value: Date): string {
  return value.toISOString();
}

export function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

/**
 * ADR-135 (C1) — a polled GET answered conditionally: the same answer costs a 304 and no body.
 *
 * The caching work (ADR-112/113) cut the number of requests. This cuts the bytes of the ones
 * that still have to happen: three hundred phones on a 45–75 s poll re-download an identical
 * leaderboard all afternoon, and the board only actually changes a few dozen times.
 *
 * **It saves bytes, not database time.** The body has to be built before it can be hashed, so a
 * 304 costs exactly what a 200 costs on the server — a memo hit for the participant surfaces
 * (ADR-038), a real query for the staff ones, which have no memo and were never meant to have
 * one (A-6, twenty facilitators are not three hundred phones). Anybody reaching for this to
 * save query time has the wrong tool.
 *
 * The validator is a hash of the exact bytes being sent, which is the only honest option for a
 * computed body: there is no mtime, no immutable id, and no single row whose version could
 * stand in for \"has any of this changed\". It is therefore a **strong** ETag — same bytes, same
 * tag — and that is what makes the 304 safe to believe.
 *
 * `private` because every one of these answers is scoped to a session; `no-cache` because the
 * browser must revalidate before reuse rather than serve a stale board. Together they are what
 * makes a borrowed phone safe: a second participant signing in on the same device has the same
 * URL, so the only thing standing between them and the first one's data is that the entry is
 * never used without asking — and when it is asked, the body differs and the ETag misses.
 *
 * No client change is needed. The browser's own HTTP cache stores the response, attaches
 * `if-none-match` on the next poll, and hands `fetch` the stored body when the server answers
 * 304 — so `response.json()` keeps working and the hooks never learn this happened.
 */
export function respondCached(c: Context, body: unknown): Response {
  const payload = JSON.stringify(body);
  const etag = `"${createHash('sha1').update(payload).digest('base64url')}"`;
  const headers: Record<string, string> = {
    etag,
    'cache-control': 'private, no-cache',
    /*
     * The session travels in a header (ADR-016), and the URL alone does not identify the
     * answer. Without this, a cache keyed on URL could hand one participant another's body.
     * `private` already excludes shared caches; this covers the browser's own.
     */
    vary: 'authorization, x-psd-session',
  };
  const ifNoneMatch = c.req.header('if-none-match');
  if (ifNoneMatch !== undefined && ifNoneMatch.includes(etag)) return c.body(null, 304, headers);
  return c.body(payload, 200, { ...headers, 'content-type': 'application/json' });
}
