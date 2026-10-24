import { readdirSync } from 'node:fs';

/**
 * The photographs the cut-out report walks, by file name: the top level of `images/ingest/`, where
 * the social, booth and passport fixtures live. This is the one definition. The dev server's
 * `/corpus/*` routes (vite.config.ts), the browser report (tools/cutoutReport.ts) and the headless
 * screen (scripts/cutout-corpus-report.ts) all list through it, so they cannot drift apart.
 *
 * It does not reach `images/ingest/social/`, the adversarial set. The demo persona list names
 * 120 photographs: twenty top-level `social-*` and 100 in that folder
 * (scripts/demo-personas.json). This walk therefore covers twenty of the 120, and the booth and
 * passport photographs are not in the crowd at all. The gap is recorded as defect C1 in
 * `src/lib/avatar/cutoutCorpus.test.ts`. Changing what this walks is a protocol decision, not a
 * refactor.
 */
export const CUTOUT_CORPUS_PATTERN = /^(social|booth|passport).*\.png$/;

/** The file names the report walks in `directory`, sorted. */
export function listCutoutCorpus(directory: string): string[] {
  return readdirSync(directory)
    .filter((name) => CUTOUT_CORPUS_PATTERN.test(name))
    .sort();
}
