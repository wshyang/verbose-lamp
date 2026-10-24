import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withStaticWeb } from '../webStatic.js';

/**
 * ADR-043: in a single-container deployment the API is the only origin, so it must serve the
 * built SPA without ever shadowing /api or leaking files outside the dist directory.
 */

let dist: string;
let handler: (request: Request) => Response | Promise<Response>;
const api = (request: Request): Response =>
  new Response(`api:${new URL(request.url).pathname}`, { status: 200 });

beforeAll(async () => {
  dist = await mkdtemp(join(tmpdir(), 'psd-web-dist-'));
  await writeFile(join(dist, 'index.html'), '<!doctype html><title>psd</title>');
  await mkdir(join(dist, 'assets'), { recursive: true });
  await writeFile(join(dist, 'assets', 'app-abc123.js'), 'console.log("bundle")');
  const sentosa = join(dist, 'themes', 'sentosa');
  await mkdir(join(sentosa, 'motifs'), { recursive: true });
  await writeFile(join(sentosa, 'motifs', 'palm.svg'), '<svg />');
  await mkdir(join(sentosa, 'scene'), { recursive: true });
  await writeFile(join(sentosa, 'scene', 'panorama.png'), 'PNG');
  await mkdir(join(sentosa, 'scene-2x'), { recursive: true });
  await writeFile(join(sentosa, 'scene-2x', 'panorama.png'), 'PNG2X');
  await mkdir(join(sentosa, 'scene-real'), { recursive: true });
  await writeFile(join(sentosa, 'scene-real', 'panorama.jpg'), 'JPG');
  handler = withStaticWeb(api, dist);
});

afterAll(async () => {
  await rm(dist, { recursive: true, force: true });
});

describe('withStaticWeb', () => {
  it('passes /api requests through untouched', async () => {
    const response = await handler(new Request('http://x/api/health'));
    expect(await response.text()).toBe('api:/api/health');
  });

  it('answers 400 to a malformed percent-escape instead of throwing', async () => {
    // decodeURIComponent('/%') throws URIError; ADR-324 — that must be a 400 for this request.
    const response = await handler(new Request('http://x/%E0%A4%A'));
    expect(response.status).toBe(400);
  });

  it('serves a real file with its content type and immutable caching for hashed assets', async () => {
    const response = await handler(new Request('http://x/assets/app-abc123.js'));
    expect(response.headers.get('content-type')).toContain('text/javascript');
    expect(response.headers.get('cache-control')).toContain('immutable');
    expect(await response.text()).toContain('bundle');
  });

  it('falls back to index.html for SPA deep links, without long-lived caching', async () => {
    const response = await handler(new Request('http://x/home/queue'));
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('cache-control')).toBe('no-cache');
    expect(await response.text()).toContain('psd');
  });

  it('serves index.html at the root', async () => {
    const response = await handler(new Request('http://x/'));
    expect(await response.text()).toContain('psd');
  });

  /*
   * ADR-126 changed the *shape* of the refusal, not the refusal. This path reads as a filename
   * once decoded, so it is now answered 404 rather than with the SPA shell — which is a
   * stronger answer, not a weaker one. What the test asserts is the property that matters and
   * has never moved: the file outside the dist root is never served.
   */
  it('refuses to escape the dist directory via encoded traversal', async () => {
    const response = await handler(new Request('http://x/..%2f..%2fetc%2fpasswd'));
    const body = await response.text();
    expect(body).not.toContain('root:');
    expect(response.status).toBe(404);
  });

  it('leaves non-GET methods to the API', async () => {
    const response = await handler(new Request('http://x/anything', { method: 'POST' }));
    expect(await response.text()).toBe('api:/anything');
  });
});

/**
 * ADR-126 — the art under `public/` is content-addressed by the application (`?v=<hash>`,
 * ADR-014/067) and was nonetheless served `no-cache` with no validator at all, so every
 * reload re-downloaded all of it. These are the two halves of the fix and the one thing that
 * must NOT move.
 */
describe('withStaticWeb — caching the content-versioned art (ADR-126)', () => {
  it.each([
    ['/themes/sentosa/motifs/palm.svg', 'image/svg+xml'],
    ['/themes/sentosa/scene/panorama.png', 'image/png'],
    ['/themes/sentosa/scene-2x/panorama.png', 'image/png'],
  ])('serves %s immutably, because its URL carries the content hash', async (path, mime) => {
    const response = await handler(new Request(`http://x${path}`));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain(mime);
    expect(response.headers.get('cache-control')).toContain('immutable');
  });

  it('does not hold scene-real for a year — its stamp is a build time, not a content hash', async () => {
    const response = await handler(new Request('http://x/themes/sentosa/scene-real/panorama.jpg'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-cache');
  });

  it('never lets index.html go immutable — it is what decides whether a deploy is seen', async () => {
    const response = await handler(new Request('http://x/'));
    expect(response.headers.get('cache-control')).toBe('no-cache');
  });

  it('gives every file a validator, so even a no-cache file can be revalidated', async () => {
    const response = await handler(new Request('http://x/'));
    expect(response.headers.get('etag')).toMatch(/^"[0-9a-f]+-[0-9a-f]+"$/);
  });

  it('answers a conditional request for an unchanged file with a bodyless 304', async () => {
    const first = await handler(new Request('http://x/'));
    const etag = first.headers.get('etag') ?? '';
    const second = await handler(
      new Request('http://x/', { headers: { 'if-none-match': etag } }),
    );
    expect(second.status).toBe(304);
    expect(second.headers.get('etag')).toBe(etag);
    expect(await second.text()).toBe('');
  });

  it('still answers 200 when the validator does not match', async () => {
    const response = await handler(
      new Request('http://x/', { headers: { 'if-none-match': '"stale-etag"' } }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('psd');
  });

  it('issues a different validator once the file changes', async () => {
    const before = await handler(new Request('http://x/themes/sentosa/motifs/palm.svg'));
    await writeFile(join(dist, 'themes', 'sentosa', 'motifs', 'palm.svg'), '<svg><!-- redrawn --></svg>');
    const after = await handler(new Request('http://x/themes/sentosa/motifs/palm.svg'));
    expect(after.headers.get('etag')).not.toBe(before.headers.get('etag'));
  });
});

/**
 * ADR-126 — a missing file that is plainly a file must 404. `GET /sw.js` used to answer 200
 * with index.html's HTML, which is the one behaviour that would make a future service worker
 * impossible to withdraw: a browser re-fetching a deleted worker script must get a 404 for the
 * registration to be retired, and it never could.
 */
describe('withStaticWeb — a missing asset is a 404, not the SPA shell (ADR-126)', () => {
  it.each(['/sw.js', '/missing.json', '/nope.png'])('404s %s rather than serving HTML', async (path) => {
    const response = await handler(new Request(`http://x${path}`));
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).not.toContain('text/html');
  });

  it('still falls back to index.html for an extensionless deep link', async () => {
    const response = await handler(new Request('http://x/team/line-ups'));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('psd');
  });
});

/**
 * ADR-147 — the two properties the whole withdrawal story rests on. Both are currently side
 * effects of rules written for other reasons, which is exactly why they are pinned here: a
 * careless edit elsewhere would take them away silently, and the cost would be discovered
 * only on the afternoon somebody needed to retire a worker in a hurry.
 */
describe('withStaticWeb — the service worker stays withdrawable (ADR-147)', () => {
  let swDist: string;
  let swHandler: (request: Request) => Response | Promise<Response>;

  beforeAll(async () => {
    swDist = await mkdtemp(join(tmpdir(), 'psd-web-sw-'));
    await writeFile(join(swDist, 'index.html'), '<!doctype html><title>psd</title>');
    await writeFile(join(swDist, 'sw.js'), 'self.addEventListener("fetch", () => {})');
    swHandler = withStaticWeb(api, swDist);
  });
  afterAll(async () => rm(swDist, { recursive: true, force: true }));

  /*
   * A worker held `immutable` for a year could never be updated or replaced by a tombstone.
   * It is `no-cache` today only because `cacheControlFor` grants immutability to four named
   * directories and the worker lives at the dist root — one entry added to that list and
   * this stops being true.
   */
  it('serves sw.js as no-cache, never immutable', async () => {
    const response = await swHandler(new Request('http://x/sw.js'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-cache');
    expect(response.headers.get('etag')).not.toBeNull();
  });

  /* Deleting the file from a deploy is step 2 of the withdrawal: a browser retires a worker
   * only when its script 404s on re-fetch, so the SPA fallback must never answer for it. */
  it('404s a deleted sw.js, which is how a worker is retired', async () => {
    const response = await handler(new Request('http://x/sw.js'));
    expect(response.status).toBe(404);
  });
});
