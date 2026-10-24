/**
 * ADR-014 / ADR-067 / ADR-297 — the motif corpus as a pure function of a palette and a set of
 * grids: validation, the SVG serialiser and the content stamp. No I/O, no knowledge of any venue.
 *
 * A theme supplies the venue-owned `ramps` and `grids`; `base-palette.mjs` and `grids/*.mjs`
 * supply the rest (`corpusFor` in `theme-corpus.mjs` does the merge). Everything here takes those
 * as arguments, so the review sheet, the drift test, the generator and a unit test with a made-up
 * venue all read the same code.
 *
 * Decoration is participant-only (fds.md §5.5). `npm run standards` fails if anything under
 * components/participant/ is imported from a facilitator or superadmin surface.
 */
import { createHash } from 'node:crypto';

/**
 * `stampStylesheet` rewrites `/themes/<id>/motifs/<name>.svg` references by regex, so a name it
 * cannot match would ship an unstamped URL — the stale-cache bug ADR-018 exists to prevent. Keep
 * the two in step: this is the charset that regex accepts.
 */
export const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/** Every hex a set of ramps may resolve to. The drift test checks the SVGs against this. */
export function rampColours(ramps) {
  return new Set(Object.values(ramps).flatMap((ramp) => [...ramp.tones, ramp.outline]));
}

/**
 * Resolve one `<letter><tone>` cell. Tone 0 is the material's outline; 1-4 are its tones.
 * Returns null for the transparent cell so callers can treat "no colour" uniformly.
 */
export function rampColour(ramps, cell) {
  if (cell === '..') return null;
  const ramp = ramps[cell[0]];
  if (!ramp) throw new Error(`unknown material "${cell[0]}" in cell "${cell}"`);
  if (cell[1] === '0') return ramp.outline;
  const tone = ramp.tones[Number(cell[1]) - 1];
  if (!tone) throw new Error(`unknown tone "${cell[1]}" in cell "${cell}"`);
  return tone;
}

/**
 * A grid resolved to hexes, `null` where transparent. The one place that knows how a cell is
 * spelled, so the review sheet and the serialiser both stay ignorant of the format.
 */
export function colourGrid({ ramps, grids }, name) {
  const rows = grids[name];
  if (!rows) throw new Error(`no motif named "${name}"`);
  return rows.map((row) => {
    const cells = [];
    for (let at = 0; at < row.length; at += 2) cells.push(rampColour(ramps, row.slice(at, at + 2)));
    return cells;
  });
}

/**
 * The generator had no validation at all: an unknown key rendered *nothing* and the run still
 * reported success. Modelled on `assertLayer` in generate-avatar-art.mjs.
 */
export function assertGrid(corpus, name, rows) {
  if (!NAME_PATTERN.test(name)) {
    throw new Error(`${name}: name must match ${NAME_PATTERN} to survive CSS stamping`);
  }
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`${name}: no rows`);

  const chars = rows[0].length;
  if (chars === 0) throw new Error(`${name}: row 0 is empty`);
  if (chars % 2 !== 0) throw new Error(`${name}: row 0 has ${chars} chars, not whole 2-char cells`);
  for (const [y, row] of rows.entries()) {
    if (row.length !== chars) {
      throw new Error(`${name}: row ${y} is ${row.length} chars, expected ${chars}`);
    }
  }
  // Throws from `rampColour` on an unknown material or tone.
  colourGrid(corpus, name);
}

/**
 * ADR-075 — one `<path>` per colour, not one `<rect>` per pixel.
 *
 * Measured on this corpus: per-pixel rects cost 1.4 MB, horizontal run-merged rects 0.6 MB, and
 * one path per colour 0.19 MB. The byte count is the lesser reason. Adjacent same-colour rects
 * snap independently under `shape-rendering="crispEdges"` and can show a hairline seam at a
 * fractional scale; a single filled region per colour cannot seam against itself, on either axis.
 *
 * Horizontal runs become `M<x> <y>h<run>v1h-<run>z` subpaths, all concatenated into one `d`.
 */
function pathsFor(cells) {
  const byColour = new Map();
  cells.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const fill = row[x];
      if (!fill) {
        x += 1;
        continue;
      }
      let run = 1;
      while (x + run < row.length && row[x + run] === fill) run += 1;
      byColour.set(fill, `${byColour.get(fill) ?? ''}M${x} ${y}h${run}v1h-${run}z`);
      x += run;
    }
  });
  return [...byColour].map(([fill, d]) => `<path fill="${fill}" d="${d}"/>`).join('');
}

export function spriteSvg(corpus, name) {
  const cells = colourGrid(corpus, name);
  const width = cells[0].length;
  const height = cells.length;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"`,
    ` shape-rendering="crispEdges" width="${width * 4}" height="${height * 4}" role="img">`,
    pathsFor(cells),
    '</svg>',
  ].join('');
}

/** Every sprite, validated and serialised. One place decides what the corpus *is*. */
export function buildSprites(corpus) {
  const out = {};
  for (const [name, rows] of Object.entries(corpus.grids)) {
    assertGrid(corpus, name, rows);
    out[name] = spriteSvg(corpus, name);
  }
  return out;
}

/**
 * ADR-067 — the stamp hashes the *emitted SVG*, not the grids.
 *
 * Hashing the grids (ADR-018) left two holes: a palette edit and a serialiser change both
 * produce different bytes under an unchanged stamp, which is exactly the stale-cache bug the
 * stamp was introduced to fix. Hashing the output covers grids, palette, serialiser and
 * viewBox by construction — and lets a test recompute it from the committed files alone.
 *
 * Names are sorted so regrouping the grids by theme cannot move the version.
 */
export function versionOf(sprites) {
  const hash = createHash('sha256');
  for (const name of Object.keys(sprites).sort()) hash.update(`${name}:${sprites[name]}`);
  return hash.digest('hex').slice(0, 8);
}
