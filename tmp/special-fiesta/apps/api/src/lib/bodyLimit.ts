import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { AVATAR_SPRITE_MAX_LENGTH, messages } from '@psd/contracts';
import { HttpError } from './http.js';

/**
 * ADR-324 — the most JSON the API will buffer from any caller.
 *
 * Derived from the contracts rather than guessed: the largest legitimate body is an avatar sprite
 * (`AVATAR_SPRITE_MAX_LENGTH`, 50 000 characters) plus its sibling fields, and the rest are a few
 * hundred bytes. Double that, plus slack, still ends the megabyte-scale posts this exists to stop.
 * `bodyLimit` counts the bytes as they arrive, so a chunked body with no `Content-Length` is
 * refused too, not just one that declares itself large.
 */
export const JSON_BODY_MAX_BYTES = AVATAR_SPRITE_MAX_LENGTH * 2 + 8 * 1024;

/** Path prefixes with their own, larger limit; the generic one must not pre-empt them. */
const OWN_LIMIT = [/^\/api\/gallery\/photos$/];

export function jsonBodyLimit(): MiddlewareHandler {
  const limit = bodyLimit({
    maxSize: JSON_BODY_MAX_BYTES,
    onError: () => {
      throw new HttpError(413, messages.requestTooLarge);
    },
  });
  return (c, next) => (OWN_LIMIT.some((pattern) => pattern.test(c.req.path)) ? next() : limit(c, next));
}
