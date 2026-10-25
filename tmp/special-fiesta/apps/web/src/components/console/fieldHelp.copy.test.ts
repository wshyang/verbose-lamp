import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fieldHelp, type FieldHelpTopic } from '@psd/contracts';

/**
 * ADR-319/322 — the help copy is data, so it can drift from the screens that use it in two ways: a
 * topic nobody renders any more, and a screen asking for a topic that has no sentence. Both are
 * caught here by reading the source rather than by remembering to.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROUTES = join(HERE, '..', '..', 'routes-superadmin');
const FACILITATOR_ROUTES = join(HERE, '..', '..', 'routes-facilitator');
const COURT_ROUTES = join(HERE, '..', '..', 'routes-court');

function sourcesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourcesUnder(path);
    return entry.name.endsWith('.tsx') && !entry.name.includes('.test.') ? [path] : [];
  });
}

const topics = Object.keys(fieldHelp) as FieldHelpTopic[];
const source = [...sourcesUnder(ROUTES), ...sourcesUnder(FACILITATOR_ROUTES), ...sourcesUnder(COURT_ROUTES), join(HERE, 'ReasonDialog.tsx')]
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');

describe('the field help copy (ADR-319)', () => {
  it('has a real sentence for every topic', () => {
    for (const topic of topics) {
      expect(fieldHelp[topic].trim().length, topic).toBeGreaterThan(30);
      expect(fieldHelp[topic], `${topic} should end like a sentence`).toMatch(/[.)]$/);
    }
  });

  it('is used: every topic is asked for by a screen', () => {
    const unused = topics.filter((topic) => !new RegExp(`['"]${topic}['"]`).test(source));
    expect(unused).toEqual([]);
  });

  it('is complete: every topic a screen asks for exists', () => {
    const asked = [...source.matchAll(/topic=(?:\{?)['"]([A-Za-z0-9]+)['"]/g)].map((match) => match[1] ?? '');
    const missing = asked.filter((topic) => !(topic in fieldHelp));
    expect(missing).toEqual([]);
    expect(asked.length).toBeGreaterThan(30);
  });

  it('states the true range for the fields that have one', () => {
    expect(fieldHelp.courtNumber).toContain('1 to 20');
    expect(fieldHelp.setupWinPoints).toContain('0 to 100');
    expect(fieldHelp.stageCode).toContain('12');
  });

  it('says the Reason is not always required', () => {
    expect(fieldHelp.actReason).toMatch(/closing/i);
  });
});
