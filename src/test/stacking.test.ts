import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The stacking order of the app's surfaces, read from the source rather than restated.
 *
 * Tailwind finds classes by scanning for literal strings, so a z-index cannot be built from a shared
 * constant at runtime; each component keeps its own `z-[n]`. That makes the order easy to break
 * one file at a time, and the breakage invisible without a browser: a modal that opens behind a
 * non-modal panel can be read but not clicked. This test reads the literal class from each file and
 * holds the order that has to stay true.
 */
const ROOT = process.cwd();

function zOf(file: string, anchor: string): number {
  const source = readFileSync(join(ROOT, file), 'utf8');
  const line = source.split('\n').find((candidate) => candidate.includes(anchor));
  if (!line) throw new Error(`${file}: no line contains ${anchor}`);
  const match = /\bz-(?:\[(\d+)\]|(\d+))/.exec(line);
  if (!match) throw new Error(`${file}: no z-index on the line with ${anchor}`);
  return Number(match[1] ?? match[2]);
}

const SURFACES = {
  hud: zOf('src/app/components/PremiereHeader.tsx', 'absolute left-0 right-0 top-0'),
  hudToggle: zOf('src/app/components/FloatingHudToggle.tsx', 'z-'),
  studio: zOf('src/features/frame-studio/components/FrameStudioControl.tsx', 'overflow-y-auto'),
  console: zOf('src/features/spectacle-preview/components/SpectaclePreviewPanel.tsx', 'fixed bottom-24'),
  draw: zOf('src/features/lucky-draw/components/LuckyDrawStage.tsx', 'fixed inset-0'),
  research: zOf('src/features/research/components/ResearchModal.tsx', 'backdropClassName'),
  titleEditor: zOf('src/features/title-customizer/components/CustomTitleModal.tsx', 'backdropClassName'),
  qr: zOf('src/features/qr-generator/QrGeneratorModal.tsx', 'backdropClassName'),
  avatar: zOf('src/features/avatar-studio/components/AvatarStudioModal.tsx', 'backdropClassName'),
  portrait: zOf('src/features/gilded-portrait/GildedPortraitModal.tsx', 'backdropClassName'),
} as const;

const MODALS = ['research', 'titleEditor', 'qr', 'avatar', 'portrait'] as const;
const NON_MODAL = ['hud', 'hudToggle', 'studio', 'console'] as const;

describe('surface stacking', () => {
  it('reads a number for every surface', () => {
    for (const [name, z] of Object.entries(SURFACES)) {
      expect(Number.isFinite(z), name).toBe(true);
    }
  });

  // A modal behind a docked panel is unusable: the panel's dead area swallows the clicks.
  it.each(MODALS)('puts the %s modal above every docked, non-modal surface', (modal) => {
    for (const other of NON_MODAL) {
      expect(SURFACES[modal], `${modal} (${SURFACES[modal]}) vs ${other} (${SURFACES[other]})`).toBeGreaterThan(
        SURFACES[other]
      );
    }
  });

  it('puts the docked console above the studio, so neither covers the other when both are open', () => {
    expect(SURFACES.console).toBeGreaterThanOrEqual(SURFACES.studio);
  });

  it('keeps the hud under the panels it launches', () => {
    expect(SURFACES.hud).toBeLessThan(SURFACES.studio);
    expect(SURFACES.hud).toBeLessThan(SURFACES.console);
  });

  // The lucky draw is a dialog, but it is launched from the console and is meant to be watched
  // while the console stays reachable (to stop a spray, change the seed), so it deliberately sits
  // under the docked panels and above the cinematic hud. It is the one modal that does not outrank them.
  it('keeps the lucky draw above the hud but under the docked panels, by design', () => {
    expect(SURFACES.draw).toBeGreaterThan(SURFACES.hud);
    expect(SURFACES.draw).toBeLessThan(SURFACES.console);
    expect(SURFACES.draw).toBeLessThan(SURFACES.studio);
  });

  // Confetti and the name reveal must show over the lucky draw (they are celebrating its result),
  // but never over the console that is driving them, or the controls would be washed out.
  it('draws the effect canvases over the lucky draw but under every docked panel and modal', () => {
    const engine = readFileSync(join(ROOT, 'src/features/spectacle/engine/layers.ts'), 'utf8');
    const canvasZ = [...engine.matchAll(/z:\s*'(\d+)'/g)].map((match) => Number(match[1]));
    const highest = Math.max(...canvasZ);

    expect(canvasZ.length).toBe(3);
    expect(highest).toBeGreaterThan(SURFACES.draw);
    for (const name of ['studio', 'console', ...MODALS] as const) expect(highest).toBeLessThan(SURFACES[name]);
  });
});

