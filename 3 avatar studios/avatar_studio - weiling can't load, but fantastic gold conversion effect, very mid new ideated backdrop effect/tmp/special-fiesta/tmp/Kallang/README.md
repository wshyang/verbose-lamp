# Active Day at The Kallang — animated pixel-art scene

A living pixel-art scene of Singapore's Kallang waterfront (National Stadium /
Sports Hub) on an event day: dragon boats and kayaks racing, people walking,
jogging and cheering along the promenade, event tents, a start/finish arch —
all cut out of the original AI-generated sprite sheets in this repo and
animated in the browser.

**Start here:** [`CLAUDE.md`](CLAUDE.md) (standing instructions, adopted from
`wshyang/greenfield`), [`docs/spec.md`](docs/spec.md) (living spec) and
[`docs/addenda/`](docs/addenda/) (numbered decision log: 0001 Greenfield
adoption, 0002 stack/dedup, 0003 composite anchor tuning, 0004 scene tuning).

## Quick start

```bash
npm ci
npm run dev            # http://localhost:3000 (0.0.0.0, forwarded hosts allowed)
```

Production: `npm run build` then serve `dist/` on port 3000 — or
`docker build -t kallang-active-day . && docker run -p 3000:3000 kallang-active-day`.

Page controls: Pause / Speed / **View: Scene ⇄ Composite lab** / anchor-point
overlay. URL parameters: `?seed=20261017&t=6.5&view=lab`.
Browse every extracted sprite at `/sprites-atlas.html`.

## How the art pipeline works (313 sprites)

| Stage | Tool | Output |
|---|---|---|
| Dedup & curate sources | `tools/organise_sources.py` | `src/images/` (11 unique, SHA-256-verified) + `docs/asset-manifest.json` |
| Extract pieces | `tools/extract_sprites.py` (+ `sprite_pipeline.py`, `sheet_config.py`) | `public/sprites/<class>/<id>.png`, `src/generated/sprite-manifest.json`, `public/backdrops/` |
| Atlas page | `tools/build_atlas.py` | `public/sprites-atlas.html` |
| Visual QA | `npm run qa:lab` / `qa:scene` (napi-canvas) | `qa/lab*.png`, `qa/scene-t*.png` |

Source art arrived as 13 loose files: two byte-identical duplicate pairs
(removed), three backdrops + a populated reference + a sky plate, five
magenta-backed sprite sheets (characters, boats, clouds, water-effects & props
×2) and a reference photo. Extraction keys the magenta
(`min(R,B)-G` ramp — legitimate purple art survives), despills edges, groups
detached droplets into their splash, and excludes text baked into two sheets.
Debug any sheet with `python3 tools/extract_sprites.py --debug` (numbered-box
overlays land in `qa/`).

## Composite objects & anchor points

The dragon-boat crews and kayakers were painted **without paddles**; loose
paddles appear separately at the bottom of the boats sheet. In
`src/objects/dragonBoat.ts` / `kayak.ts` each paddle is stitched to its
paddler at a measured anchor (hand cluster for dragon boats, lap/chest pivot
for kayaks) and driven through a named stroke cycle. **All stitch geometry
lives in `src/generated/anchors.json`** (fractions of the base sprite) — tune
there, re-render `npm run qa:lab`, and inspect the still; the web "Composite
lab" view shows the same animation with optional anchor cross-hairs. The
tuning history is addendum 0003.

## Tests & validation (honest layering)

| Layer | Command | Status |
|---|---|---|
| Python (pipeline logic, manifest↔disk, shiphats activation) | `python3 -m pytest tests/python -q` | 11 passing |
| TypeScript unit (RNG, stroke/anchor math, scene build vs real manifest) | `npm test` | 12 passing |
| Typecheck + production build | `npm run build` | passing |
| Visual stills (real renderer on napi-canvas, no browser) | `npm run qa:lab`, `npm run qa:scene` | passing — see `qa/` |
| Playwright e2e (`tests/e2e/`, video on by default) | `npm run test:e2e` | authored; **not run in the authoring sandbox** (browser download unavailable there) — run anywhere with `npx playwright install chromium` |
| Docker build | `docker build .` | authored per template; not run where Docker is unavailable |

Determinism: seeded RNG + injectable clock (`?seed=`, `?t=`) mean the same
`(seed, t)` renders the same frame in unit tests, Node QA stills and browsers.

## Deployment scaffolding

`Dockerfile` (multi-stage static build, port 3000 on `0.0.0.0`, non-root,
healthcheck), `Dockerfile.dev`, `Dockerfile.cloudflared` (pinned, runtime
`TUNNEL_TOKEN` only) — contextualised from the greenfield initial templates.
SHIP-HATS files are kept inert with `.shiphats` suffixes; run
`./activate-shiphats.sh` to render them active (see CLAUDE §10.3).

## Repository map

- `src/images/` curated source art · `src/objects/` one module per object class
- `src/scene/` composition + composite lab · `src/lib/` contracts, RNG, animation math
- `src/generated/` sprite manifest + anchors (generated — don't hand-edit)
- `public/sprites/` extracted sprites · `public/backdrops/` web backdrops
- `tools/` Python pipeline · `qa/` rendered QA stills · `tests/` unit (TS) + python + e2e
