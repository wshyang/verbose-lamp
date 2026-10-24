import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * ADR-144 — the guard for the bug this phase found.
 *
 * The hall screen shipped reading `var(--gb-screen, …)`, `var(--gb-ink, …)` and two more of
 * the same family. No such custom properties have ever existed in this codebase, so every
 * one of them silently fell through to its fallback — and the body fallback was a near-black
 * green on a near-black field, a contrast ratio of **1.33:1**. The scores were, in the most
 * literal sense, not on the wall. Nothing caught it, because a fallback is CSS's way of
 * making a typo look deliberate, and no test renders a projector.
 *
 * So: every custom property this stylesheet reads must be one this codebase defines, fallback
 * or no fallback. That is the single check that would have failed on the day it was written.
 */

function read(name: string): string {
  return readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');
}

/** `--name` from every `var(--name…)`, and from every `--name:` declaration. */
function propertiesIn(css: string, pattern: RegExp): Set<string> {
  return new Set([...css.matchAll(pattern)].map((hit) => hit[1] ?? ''));
}

describe('the hall screen stylesheet', () => {
  it('reads only custom properties that something actually defines', () => {
    const screenCss = read('./screen.css');
    const defined = new Set([
      ...propertiesIn(read('./tokens.css'), /(--[a-z0-9-]+)\s*:/g),
      // The venue colours the hall screen borrows (--accent) live in the theme (ADR-296).
      ...propertiesIn(read('../themes/sentosa/theme.css'), /(--[a-z0-9-]+)\s*:/g),
      ...propertiesIn(screenCss, /(--[a-z0-9-]+)\s*:/g),
    ]);

    const used = propertiesIn(screenCss, /var\(\s*(--[a-z0-9-]+)/g);
    const undefinedProperties = [...used].filter((name) => !defined.has(name));

    expect(undefinedProperties).toEqual([]);
  });

  it('never paints the body text in the colour of its own background', () => {
    const screenCss = read('./screen.css');

    // The projector's whole job is contrast. These two must come from different tokens, and
    // the one time they did not, the result was a wall that looked switched off.
    expect(screenCss).toContain('background: var(--screen-bg)');
    expect(screenCss).toContain('color: var(--screen-ink)');
    expect(screenCss).not.toContain('--gb-');
  });
});
