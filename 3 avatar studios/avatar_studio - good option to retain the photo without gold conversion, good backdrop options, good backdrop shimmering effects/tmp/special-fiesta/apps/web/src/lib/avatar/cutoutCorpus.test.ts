import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listCutoutCorpus } from '../../../tools/cutoutCorpus.js';

/*
 * What the cut-out report walks, against the photographs the demo personas are recorded from. Reads
 * the repository, not a synthetic matte, so it lives apart from cutOutScore.test.ts.
 *
 * Known defect C1 (expected failure, `it.fails`): the walk is the top level of images/ingest/,
 * which reaches twenty of the 120 photographs in the demo persona list. The other 100
 * sit in images/ingest/social/, and neither the gate nor the headless screen reaches them. This
 * test passes while C1 is present and goes red once the walk changes on purpose. Then flip
 * `it.fails` to `it` and update the pinned count below in the same change. Changing the walk is a
 * protocol decision.
 */

/**
 * Walk up for the repository root rather than counting `..` segments: under jsdom `import.meta.url`
 * is an http URL, and the suite runs both from the repository root and from `apps/web`.
 */
function repoRoot(): string {
  let at = process.cwd();
  for (let up = 0; up < 6; up += 1) {
    if (existsSync(resolve(at, 'scripts/demo-personas.json'))) return at;
    at = dirname(at);
  }
  throw new Error(`could not find scripts/demo-personas.json above ${process.cwd()}`);
}

const ROOT = repoRoot();
const INGEST = resolve(ROOT, 'images/ingest');

/** The crowd's photographs as `images/ingest`-relative names, e.g. `social/01-front-smile.png`. */
const crowd: string[] = (
  JSON.parse(readFileSync(resolve(ROOT, 'scripts/demo-personas.json'), 'utf8')) as {
    participants: { sourceImage: string }[];
  }
).participants.map((one) => one.sourceImage.replace(/^images\/ingest\//, ''));

describe('the demo crowd the report is meant to cover (fixture sanity)', () => {
  it('lists 120 distinct photographs', () => {
    expect(crowd).toHaveLength(120);
    expect(new Set(crowd).size).toBe(120);
  });

  it('draws twenty from the top level of images/ingest and 100 from social/', () => {
    expect(crowd.filter((name) => !name.includes('/'))).toHaveLength(20);
    expect(crowd.filter((name) => name.startsWith('social/'))).toHaveLength(100);
  });
});

describe('the walk the gate and the headless screen use', () => {
  it('walks the 26 top-level photographs the runbook names, and nothing from social/', () => {
    const walked = listCutoutCorpus(INGEST);
    expect(walked).toHaveLength(26);
    expect(walked.every((name) => !name.includes('/'))).toBe(true);
  });

  it.fails('C1 — walks every photograph the demo crowd was recorded from', () => {
    const walked = new Set(listCutoutCorpus(INGEST));
    expect(crowd.filter((name) => !walked.has(name))).toEqual([]);
  });
});
