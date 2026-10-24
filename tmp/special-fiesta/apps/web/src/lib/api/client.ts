import { messages } from '@psd/contracts';
import {
  readSessionCarrier,
  readSessionToken,
  writeSessionCarrier,
  type SessionCarrier,
} from '../session/tokenStore.js';
import { readScreenKey } from '../session/screenKeyStore.js';
import { readStickySessionId } from '../session/stickySession.js';

/**
 * The wire boundary. Only lib/api and lib/hooks may import this — components must not
 * (AGENTS-frontend.md §1; enforced by `npm run standards`).
 */

export class ApiError extends Error {
  readonly status: number;
  readonly field: string | undefined;

  constructor(status: number, message: string, field?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.field = field;
  }
}

export class OfflineError extends Error {
  constructor() {
    super(messages.connectionError);
    this.name = 'OfflineError';
  }
}

interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

async function readError(response: Response): Promise<ApiError> {
  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string; field?: string };
  } | null;
  return new ApiError(
    response.status,
    payload?.error?.message ?? messages.notFound,
    payload?.error?.field,
  );
}

/**
 * What this page is allowed to be: a signed-in person, a hall screen, or neither.
 *
 * ADR-140 put the screen's key beside the session token rather than inside it, because the
 * two authorise different things and the API tells them apart deliberately — a screen can
 * read the board and cannot read a chat. They are carried together because a superadmin may
 * well have the admin page and the projector preview open in the same browser.
 *
 * The carrier is one decision for both (ADR-016): headers surviving the tunnel is a fact
 * about the deployment, so whatever one credential learned, the other already knows.
 */
interface WireCredentials {
  sessionToken: string | null;
  screenKey: string | null;
  carrier: SessionCarrier;
}

function readCredentials(carrier?: SessionCarrier): WireCredentials {
  return {
    sessionToken: readSessionToken(),
    screenKey: readScreenKey(),
    carrier: carrier ?? readSessionCarrier(),
  };
}

function hasCredential(credentials: WireCredentials): boolean {
  return credentials.sessionToken !== null || credentials.screenKey !== null;
}

/**
 * The cookie is still sent when the browser keeps one. Everything else here is for when it
 * does not (ADR-016): the same opaque token goes out in a private header, and in the query
 * string once the client has learned that headers do not survive the trip.
 */
function headersFor(body: unknown, credentials: WireCredentials): Record<string, string> {
  // ADR-263 — the sticky-session id rides every request, whatever carrier the credentials
  // settled on: the balancer hashes it before any question about the session arises.
  const headers: Record<string, string> = { 'x-sticky-session': readStickySessionId() };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (credentials.carrier !== 'header') return headers;
  if (credentials.sessionToken !== null) {
    headers['x-psd-session'] = credentials.sessionToken;
    headers['authorization'] = `Bearer ${credentials.sessionToken}`;
  }
  if (credentials.screenKey !== null) headers['x-psd-screen'] = credentials.screenKey;
  return headers;
}

function urlFor(path: string, credentials: WireCredentials): string {
  if (credentials.carrier === 'header' || !hasCredential(credentials)) return path;
  // Hand-encoded for the same reason as `galleryUrls.ts`: `URLSearchParams` spells a space
  // `+`, and this carrier has always sent `%20`.
  const carried = [
    ['session_token', credentials.sessionToken],
    ['screen_key', credentials.screenKey],
  ].filter((pair): pair is [string, string] => pair[1] !== null);
  const query = carried.map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('&');
  return `${path}${path.includes('?') ? '&' : '?'}${query}`;
}

function send(
  path: string,
  options: RequestOptions,
  credentials: WireCredentials,
): Promise<Response> {
  return fetch(urlFor(path, credentials), {
    method: options.method,
    credentials: 'same-origin',
    headers: headersFor(options.body, credentials),
    // Omitted rather than set to `undefined`: with exactOptionalPropertyTypes those differ, and
    // `RequestInit` wants a body that is absent rather than one explicitly set to nothing.
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  }).catch(() => {
    throw new OfflineError();
  });
}

/**
 * A 401 while holding a token means the credential did not arrive — some proxies rewrite or
 * strip request headers. Retry once through the query string before believing it: if that
 * works, the carrier is remembered and nothing 401s twice.
 */
async function sendWithFallback(path: string, options: RequestOptions): Promise<Response> {
  const credentials = readCredentials();
  const response = await send(path, options, credentials);
  if (response.status !== 401 || credentials.carrier !== 'header' || !hasCredential(credentials)) {
    return response;
  }

  const retry = await send(path, options, { ...credentials, carrier: 'query' });
  if (!retry.ok) return response;
  writeSessionCarrier('query');
  return retry;
}

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const response = await sendWithFallback(path, options);
  if (!response.ok) throw await readError(response);
  return (await response.json()) as T;
}

/**
 * ADR-047 — the one request in this app that is not JSON.
 *
 * `content-type` is deliberately NOT set: the browser must supply it, because only the browser
 * knows the multipart boundary it generated. Setting it by hand produces a body the server
 * cannot parse, which is the classic way to break a working upload.
 *
 * The 401-retry story is the same as everywhere else (ADR-016), so the token still finds its way
 * through a proxy that strips headers.
 */
function sendForm(
  path: string,
  form: FormData,
  credentials: WireCredentials,
): Promise<Response> {
  return fetch(urlFor(path, credentials), {
    method: 'POST',
    credentials: 'same-origin',
    headers: headersFor(undefined, credentials),
    body: form,
  }).catch(() => {
    throw new OfflineError();
  });
}

export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const credentials = readCredentials();
  let response = await sendForm(path, form, credentials);
  if (response.status === 401 && credentials.carrier === 'header' && hasCredential(credentials)) {
    const retry = await sendForm(path, form, { ...credentials, carrier: 'query' });
    if (retry.ok) {
      writeSessionCarrier('query');
      response = retry;
    }
  }
  if (!response.ok) throw await readError(response);
  return (await response.json()) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' });
}

/**
 * ADR-146 — a POST whose whole answer is its status code.
 *
 * `request` ends in `response.json()`, which is right for every call that asks a question. A
 * 204 has no body at all, and parsing one turns a perfectly good success into a thrown
 * `SyntaxError` — swallowed by a caller that swallows failures, which is how a channel that
 * has silently stopped working goes unnoticed for a whole event.
 */
export async function apiPostNoContent(path: string, body?: unknown): Promise<void> {
  const response = await sendWithFallback(path, { method: 'POST', body: body ?? {} });
  if (!response.ok) throw await readError(response);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: body ?? {} });
}

export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'PUT', body });
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'PATCH', body });
}

export function apiRemove<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
}
