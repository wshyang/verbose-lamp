import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { VENUE_IDS } from '@psd/contracts';
import { describe, expect, it } from 'vitest';
import { THEMES, themeFor } from './index.js';
import { motifUrl } from './motifUrl.js';
import { MOTIF_ROLES } from './types.js';
import { MOTIF_NAMES, SHARED_MOTIF_NAMES, type MotifName } from '../lib/motifs.js';

/**
 * ADR-294 — the contract every registered venue theme must meet, checked against the files that
 * are actually on disk. The registry's `Record<VenueId, VenueTheme>` type catches a missing theme
 * at compile time; this catches a theme that exists on paper and points at nothing.
 *
 * It iterates `THEMES`, so a second venue is held to all of it the moment it is registered.
 */

function webRoot(): string {
  let dir = resolve(process.cwd());
  while (!existsSync(join(dir, 'public', 'themes'))) {
    const next = existsSync(join(dir, 'apps', 'web', 'public', 'themes')) ? join(dir, 'apps', 'web') : dirname(dir);
    if (next === dir) throw new Error(`cannot locate apps/web from ${process.cwd()}`);
    dir = next;
  }
  return dir;
}

const WEB = webRoot();
const publicFile = (url: string): string => join(WEB, 'public', url.split('?')[0] ?? '');

describe('the theme registry (ADR-294)', () => {
  it('has a theme for every venue id the server can name', () => {
    expect(Object.keys(THEMES).sort()).toEqual([...VENUE_IDS].sort());
  });

  it('keys each theme by its own id', () => {
    for (const [key, theme] of Object.entries(THEMES)) expect(theme.id).toBe(key);
  });

  it('falls back to the default venue for an id it does not know', () => {
    // @ts-expect-error — deliberately outside the type: the runtime guard for a stale client.
    expect(themeFor('atlantis').id).toBe('sentosa');
  });
});

for (const theme of Object.values(THEMES)) {
  describe(`the ${theme.id} theme`, () => {
    it('serves its sprites from its own directory', () => {
      expect(theme.motifBase).toBe(`/themes/${theme.id}/motifs`);
    });

    it('maps every role to a sprite the app knows, shared or themed (ADR-298)', () => {
      // A role is a PLACE, and a venue may fill it with a sprite every venue draws (Tessensohn's
      // banner mark is the shared `kueh`). Only a *page* is restricted to shared names.
      for (const role of MOTIF_ROLES) {
        expect(MOTIF_NAMES, `${theme.id}.${role}`).toContain(theme.motifRoles[role]);
      }
    });

    it('has a file on disk behind every role it assigns', () => {
      for (const role of MOTIF_ROLES) {
        const file = publicFile(motifUrl(theme, theme.motifRoles[role]));
        expect(existsSync(file), `${theme.id}.${role} → ${file}`).toBe(true);
      }
    });

    it('ships a file for every sprite its roles and the shared set use', () => {
      // Not "every sprite the app has": a venue need not draw another venue's landmarks
      // (ADR-298). It must draw what its own roles name and everything a page may name directly.
      const needed = new Set<string>([...SHARED_MOTIF_NAMES, ...Object.values(theme.motifRoles)]);
      const missing = [...needed].filter((name) => !existsSync(publicFile(motifUrl(theme, name as MotifName))));

      expect(missing).toEqual([]);
    });

    it('carries the stamp its generator wrote, in its theme.css and in the module', () => {
      const css = readFileSync(join(WEB, 'src', 'themes', theme.id, 'theme.css'), 'utf8');
      const stamps = [...css.matchAll(/motifs\/[a-z0-9-]+\.svg\?v=([0-9a-f]{8})/g)].map((hit) => hit[1]);

      expect(stamps.length).toBeGreaterThan(0);
      expect([...new Set(stamps)]).toEqual([theme.motifVersion]);
    });

    it('names a status-bar colour that is a plain hex', () => {
      expect(theme.metaThemeColor).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('has copy for every place the app names the venue', () => {
      expect(theme.copy.landingSubtitle.length).toBeGreaterThan(0);
      expect(theme.copy.landingStationsPlace.length).toBeGreaterThan(0);
    });

    it('draws a scene', () => {
      expect(typeof theme.Scene).toBe('function');
    });
  });
}
