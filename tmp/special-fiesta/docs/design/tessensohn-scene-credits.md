# Tessensohn scene: credits and provenance

**Status:** in use · **Date:** 2026-10-16 · **Decision:** ADR-299

The backdrop of the CSC @ Tessensohn venue theme is the Civil Service Club's own illustration,
ported from the banner on its About page.

## Source

- Page: `https://www.csc.sg/About-CSC-Membership` (the "About CSC Membership" banner).
- Files: 130 files, about 1.9 MB, now under `apps/web/public/themes/tessensohn/scene/`.
  - 67 from the page's **phone** banner (`div.img-wrapper.mobile`): 65 SVG and 2 PNG
    (`mobilebuilding.png`, `loyangsign.png`).
  - 63 from its **desktop** banner (`div.img-wrapper.desktop`): the whole wide composition, shown on landscape screens. 15 of them are the badminton court, its net, the two players and the ball (`court`, `net`, `tennis1*`, `tennis2*`, `tennisball`). CSC does not show those in the phone banner, so on a phone the court group is placed by this project, not by CSC.
- Retrieved: 2026-10-16, from `https://www.csc.sg/2023/images/about/Banner/` (the 48 added for the wide layout, later the same day).
- Animation: the keyframes and positions in `src/themes/tessensohn/scene.css` are CSC's rules from
  `https://www.csc.sg/2023/css/about.min.css`, with every class renamed to a `csc-` prefix and the
  one-shot entrances played once per page load (ADR-299).

## Permission

The project owner stated, on 2026-10-16, that **"CSC has agreed we can reuse their SVGs"**.

That is the owner's statement. It is recorded here as such. This repository holds **no written
licence or permission from CSC**, and nothing in it should be read as one. If CSC's agreement exists
in writing (an email, a signed note), add it to this directory and link it here; if CSC withdraws
it, remove `public/themes/tessensohn/scene/` and the `csc-` rules in `scene.css`.

## What was changed

Nothing in the files themselves. They are byte-for-byte what CSC serves. This project:

- positions and animates them with CSC's own rules, renamed;
- adds a `?v=<hash>` to each URL so a changed file is never served from a stale cache (ADR-067);
- places the court group, and holds the one-shot entrances at their end state after the first page
  of a visit.

## Safety review of the files

Before they were added, every file was scanned for `<script>`, event-handler attributes,
`javascript:` URLs, `<foreignObject>`, `<iframe>`, XML entities, CSS `@import`, and any `href`/`src`/
`url()` pointing outside the file. None was found. They are loaded as `background-image`/`<img>`
only, never inlined, so even a future file with active content would not run.
