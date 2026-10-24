import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { extname, join, relative, resolve, sep } from 'node:path';

/**
 * Same-origin SPA serving for production containers (ADR-043). In development Vite owns the
 * browser origin and proxies /api here; behind a tunnel there is exactly one public origin,
 * so the API must hand out the built bundle itself. Anything under /api stays with the app;
 * a real file under WEB_DIST is streamed; every other path falls back to index.html so the
 * SPA router can take over after a hard refresh on a deep link.
 */

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

/**
 * ADR-126 — the paths whose filenames are content-addressed, and may therefore be held forever.
 *
 * Vite emits hashed filenames under `assets/`. The art under each venue theme's
 * `themes/<id>/{motifs,scene,scene-2x}/` (ADR-294) is addressed differently but just as
 * strongly: every reference to it is built as `/themes/<id>/motifs/{name}.svg?v={MOTIF_VERSION}`
 * where the version is a hash of the art itself (ADR-014/067), so a redrawn motif arrives under a
 * URL no cache has ever seen. The hash was always there; what was missing was telling the browser
 * it could rely on it. `scene-real` is excluded: its stamp is a build time, not a content hash.
 *
 * `index.html` is deliberately absent and must stay absent: it is the one file whose freshness
 * decides whether anybody sees a new deploy at all.
 *
 * Must stay in step with `isImmutablePath` in `apps/web/src/sw/policy.ts`.
 */
const THEME_ART_DIRECTORIES = new Set(['motifs', 'scene', 'scene-2x']);

/** `relativePath` is relative to the dist root, so a deploy directory's own name cannot match. */
function isImmutablePath(relativePath: string): boolean {
  const [top, id, directory, ...rest] = relativePath.split(sep);
  if (top === 'assets') return true;
  return top === 'themes' && id !== undefined && rest.length > 0 && THEME_ART_DIRECTORIES.has(directory ?? '');
}

function cacheControlFor(relativePath: string): string {
  return isImmutablePath(relativePath) ? 'public, max-age=31536000, immutable' : 'no-cache';
}

/**
 * ADR-126 — size and mtime, which is what every static file server has used for this since
 * 1996.
 *
 * `no-cache` does not mean "do not store", it means "revalidate before use" — and a response
 * with no `etag` and no `last-modified` gives the browser nothing to revalidate *with*, so the
 * revalidation is a full re-download every time. That was the actual bug: the art was not
 * slow-cached, it was uncacheable. Hashing the bytes would be stronger and would also mean
 * reading every file on every request; size+mtime changes whenever a deploy rewrites the file,
 * which is the only moment these files can change.
 */
function validatorFor(size: number, mtimeMs: number): string {
  return `"${size.toString(16)}-${Math.floor(mtimeMs).toString(16)}"`;
}

function notModified(etag: string, cacheControl: string): Response {
  return new Response(null, { status: 304, headers: { etag, 'cache-control': cacheControl } });
}

async function serveFile(
  root: string,
  filePath: string,
  ifNoneMatch: string | null,
): Promise<Response | null> {
  const info = await stat(filePath).catch(() => null);
  if (!info || !info.isFile()) return null;
  const etag = validatorFor(info.size, info.mtimeMs);
  const cacheControl = cacheControlFor(relative(root, filePath));
  if (ifNoneMatch !== null && ifNoneMatch.includes(etag)) return notModified(etag, cacheControl);
  const body = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new Response(body, {
    headers: {
      'content-type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream',
      'content-length': String(info.size),
      'cache-control': cacheControl,
      etag,
    },
  });
}

/**
 * ADR-126 — a path that names a file is answered as a file, present or absent.
 *
 * The SPA fallback exists for deep links like `/team/line-ups`, which have no extension. A
 * request for `/sw.js` or `/missing.png` is not a deep link, and answering it with index.html's
 * HTML under a 200 is actively harmful: a service worker script that 200s forever can never be
 * withdrawn, because retiring a worker depends on its script 404ing on re-fetch. Nothing
 * registers a worker today — this keeps the door unlocked for the day something might.
 */
function namesAFile(pathname: string): boolean {
  return extname(pathname) !== '';
}

/** The path with its percent-escapes decoded, or null when they are malformed (`decodeURIComponent` throws). */
function decodedPath(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

/**
 * Wraps the API fetch handler with static serving from `distDir`. Resolution is anchored to
 * the dist root and re-checked with a prefix test, so an encoded `..` in the URL can never
 * escape it — the classic traversal mistake this function exists to not make.
 */
export function withStaticWeb<Rest extends unknown[]>(
  fetchHandler: (request: Request, ...rest: Rest) => Response | Promise<Response>,
  distDir: string,
): (request: Request, ...rest: Rest) => Promise<Response> {
  const root = resolve(distDir);
  return async (request, ...rest) => {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return fetchHandler(request, ...rest);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return fetchHandler(request, ...rest);
    }
    const ifNoneMatch = request.headers.get('if-none-match');
    const decoded = decodedPath(url.pathname);
    // ADR-324 — `GET /%` is a caller's mistake; it used to throw out of this handler as an empty 500.
    if (decoded === null) return new Response('Bad request', { status: 400 });
    const target = resolve(join(root, decoded));
    if (target === root || target.startsWith(root + sep)) {
      const file = await serveFile(root, target, ifNoneMatch);
      if (file) return file;
    }
    if (namesAFile(url.pathname)) return new Response('Not found', { status: 404 });
    const index = await serveFile(root, join(root, 'index.html'), ifNoneMatch);
    return index ?? fetchHandler(request, ...rest);
  };
}
