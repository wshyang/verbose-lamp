import type { FrameArchetype } from '../../types/sequence';
import type { Motif } from './motifs';

/**
 * Act recipes (Addendum 0003): the original hand-composed frames rewritten as
 * declarative motif lists. Every number and every arithmetic expression is
 * transcribed from the baseline builder; order is significant. Equality with
 * the original is enforced by __fixtures__/signature.json.
 */
export function recipeFor(archetype: FrameArchetype, mainWidth: number): Motif[] {
  switch (archetype) {
    case 'monogram_gate':
      return monogramGateRecipe();
    case 'ziggurat_chevron':
      return zigguratChevronRecipe(mainWidth);
    case 'sunburst_octagon':
      return sunburstOctagonRecipe(mainWidth);
    case 'diamond_gateway':
      return diamondGatewayRecipe(mainWidth);
    default:
      return heroLockupRecipe(mainWidth);
  }
}

/* ------------------------------ Act I: GG gate ------------------------------ */

function monogramColumns(): Motif[] {
  const columns: Motif[] = [];
  for (let i = 0; i < 3; i++) {
    const xOff = 3.15 + i * 0.14;
    for (const s of [-1, 1] as const) {
      columns.push({
        kind: 'path',
        spec: {
          points: [
            { x: s * xOff, y: 2.3 - i * 0.25 },
            { x: s * xOff, y: -2.3 + i * 0.25 },
          ],
          width: 0.024,
          depth: 0.06,
          z: -0.18 - i * 0.12,
          delay: 0.18 + i * 0.05,
          partDir: s,
        },
      });
    }
  }
  return columns;
}

/** The interlocking GG signet; shared with the poster family's centre medallion. */
export function monogramLetterPaths(): Motif[] {
  const leftG = [
    { x: 0.34, y: 0.76 }, { x: 0.12, y: 1.05 }, { x: -0.62, y: 1.05 }, { x: -0.92, y: 0.72 },
    { x: -0.92, y: -0.72 }, { x: -0.62, y: -1.05 }, { x: 0.12, y: -1.05 }, { x: 0.38, y: -0.76 },
    { x: 0.38, y: -0.06 }, { x: -0.26, y: -0.06 },
  ];
  const leftPinstripe = [
    { x: 0.2, y: 0.68 }, { x: 0.04, y: 0.89 }, { x: -0.54, y: 0.89 }, { x: -0.76, y: 0.64 },
    { x: -0.76, y: -0.64 }, { x: -0.54, y: -0.89 }, { x: 0.04, y: -0.89 }, { x: 0.22, y: -0.68 },
    { x: 0.22, y: -0.2 }, { x: -0.22, y: -0.2 },
  ];
  const rightG = [
    { x: 0.92, y: 0.72 }, { x: 0.62, y: 1.05 }, { x: -0.12, y: 1.05 }, { x: -0.38, y: 0.76 },
    { x: -0.38, y: -0.76 }, { x: -0.12, y: -1.05 }, { x: 0.62, y: -1.05 }, { x: 0.92, y: -0.72 },
    { x: 0.92, y: 0.08 }, { x: 0.24, y: 0.08 },
  ];
  return [
    { kind: 'path', spec: { points: leftG, width: 0.075, depth: 0.14, z: 0.14, delay: 0.15, partDir: -1, role: 'monogram' } },
    { kind: 'path', spec: { points: leftPinstripe, width: 0.025, depth: 0.1, z: 0.18, delay: 0.24, partDir: -1, role: 'monogram' } },
    { kind: 'path', spec: { points: rightG, width: 0.075, depth: 0.14, z: 0.09, delay: 0.2, partDir: 1, role: 'monogram' } },
  ];
}

function monogramGateRecipe(): Motif[] {
  return [
    { kind: 'cutOctagon', halfWidth: 2.55, halfHeight: 2.95, cut: 0.72, width: 0.065, depth: 0.11, z: 0.0, delay: 0.0, role: 'primary' },
    { kind: 'cutOctagon', halfWidth: 2.36, halfHeight: 2.76, cut: 0.65, width: 0.028, depth: 0.07, z: 0.04, delay: 0.08 },
    { kind: 'cutOctagon', halfWidth: 2.82, halfHeight: 3.22, cut: 0.82, width: 0.032, depth: 0.08, z: -0.28, delay: 0.12 },
    ...monogramColumns(),
    ...monogramLetterPaths(),
    { kind: 'diamond', centerX: -2.55, centerY: 0, radiusX: 0.28, radiusY: 0.45, width: 0.032, depth: 0.08, z: 0.08, delay: 0.28, partDir: -1 },
    { kind: 'diamond', centerX: 2.55, centerY: 0, radiusX: 0.28, radiusY: 0.45, width: 0.032, depth: 0.08, z: 0.08, delay: 0.28, partDir: 1 },
    { kind: 'sunburst', centerX: 0, centerY: 2.95, innerRadius: 0.35, outerRadius: 1.35, rays: 11, spread: Math.PI * 0.76, direction: 'up', width: 0.026, depth: 0.07, z: -0.12, delay: 0.3 },
    { kind: 'sunburst', centerX: 0, centerY: -2.95, innerRadius: 0.35, outerRadius: 1.15, rays: 9, spread: Math.PI * 0.68, direction: 'down', width: 0.024, depth: 0.07, z: -0.12, delay: 0.32 },
    { kind: 'splitRule', y: 1.72, innerX: 0.15, outerX: 2.05, width: 0.022, depth: 0.05, z: 0.06, delay: 0.26 },
    { kind: 'splitRule', y: -1.72, innerX: 0.15, outerX: 2.05, width: 0.022, depth: 0.05, z: 0.06, delay: 0.26 },
  ];
}

/* ------------------------- Act II: ziggurat & chevrons ------------------------- */

function zigguratChevronRecipe(mainWidth: number): Motif[] {
  const hw = Math.max(4.4, mainWidth * 0.56 + 0.75);
  const hh = 1.68;
  return [
    { kind: 'ziggurat', halfWidth: hw, halfHeight: hh, step: 0.26, width: 0.06, depth: 0.11, z: 0.0, delay: 0.0, role: 'primary' },
    { kind: 'ziggurat', halfWidth: hw - 0.17, halfHeight: hh - 0.15, step: 0.22, width: 0.026, depth: 0.07, z: 0.05, delay: 0.08 },
    { kind: 'ziggurat', halfWidth: hw + 0.28, halfHeight: hh + 0.24, step: 0.3, width: 0.028, depth: 0.08, z: -0.32, delay: 0.14 },
    { kind: 'splitRule', y: 0.76, innerX: 0.0, outerX: hw - 0.45, width: 0.024, depth: 0.06, z: 0.06, delay: 0.16 },
    { kind: 'splitRule', y: -0.76, innerX: 0.0, outerX: hw - 0.45, width: 0.024, depth: 0.06, z: 0.06, delay: 0.16 },
    { kind: 'chevronWings', startX: hw + 0.18, count: 4, spacing: 0.32, wingWidth: 0.55, wingHeight: 1.18, width: 0.036, depth: 0.08, z: -0.14, delay: 0.22 },
    { kind: 'diamond', centerX: 0, centerY: hh, radiusX: 0.28, radiusY: 0.18, width: 0.03, depth: 0.08, z: 0.08, delay: 0.28, partDir: 1 },
    { kind: 'diamond', centerX: 0, centerY: -hh, radiusX: 0.28, radiusY: 0.18, width: 0.03, depth: 0.08, z: 0.08, delay: 0.28, partDir: -1 },
  ];
}

/* ------------------------ Act III: sunburst & octagon ------------------------ */

function sideSpears(hw: number): Motif[] {
  const spears: Motif[] = [];
  for (const s of [-1, 1] as const) {
    spears.push({ kind: 'diamond', centerX: s * (hw + 0.48), centerY: 0, radiusX: 0.45, radiusY: 0.3, width: 0.034, depth: 0.08, z: 0.02, delay: 0.24, partDir: s });
    spears.push({
      kind: 'path',
      spec: {
        points: [
          { x: s * hw, y: 0 },
          { x: s * (hw + 1.55), y: 0 },
        ],
        width: 0.032,
        depth: 0.07,
        z: 0.02,
        delay: 0.28,
        partDir: s,
      },
    });
  }
  return spears;
}

function sunburstOctagonRecipe(mainWidth: number): Motif[] {
  const hw = Math.max(4.5, mainWidth * 0.56 + 0.8);
  const hh = 1.85;
  return [
    { kind: 'cutOctagon', halfWidth: hw, halfHeight: hh, cut: 0.58, width: 0.062, depth: 0.11, z: 0.0, delay: 0.0, role: 'primary' },
    { kind: 'cutOctagon', halfWidth: hw - 0.16, halfHeight: hh - 0.15, cut: 0.5, width: 0.026, depth: 0.07, z: 0.05, delay: 0.07 },
    { kind: 'cutOctagon', halfWidth: hw - 0.3, halfHeight: hh - 0.28, cut: 0.42, width: 0.02, depth: 0.05, z: 0.08, delay: 0.13 },
    { kind: 'cutOctagon', halfWidth: hw + 0.32, halfHeight: hh + 0.28, cut: 0.68, width: 0.028, depth: 0.08, z: -0.36, delay: 0.16 },
    { kind: 'sunburst', centerX: 0, centerY: hh, innerRadius: 0.42, outerRadius: 1.65, rays: 13, spread: Math.PI * 0.82, direction: 'up', width: 0.03, depth: 0.08, z: -0.15, delay: 0.22 },
    { kind: 'sunburst', centerX: 0, centerY: -hh, innerRadius: 0.42, outerRadius: 1.35, rays: 11, spread: Math.PI * 0.74, direction: 'down', width: 0.026, depth: 0.07, z: -0.15, delay: 0.25 },
    ...sideSpears(hw),
    { kind: 'splitRule', y: 0.62, innerX: 0.0, outerX: hw - 0.55, width: 0.022, depth: 0.05, z: 0.06, delay: 0.18 },
    { kind: 'splitRule', y: -0.78, innerX: 0.0, outerX: hw - 0.55, width: 0.022, depth: 0.05, z: 0.06, delay: 0.18 },
  ];
}

/* --------------------------- Act IV: diamond gateway --------------------------- */

function latticeWings(hw: number): Motif[] {
  const wings: Motif[] = [];
  for (const s of [-1, 1] as const) {
    wings.push({ kind: 'diamond', centerX: s * (hw + 0.45), centerY: 0.52, radiusX: 0.42, radiusY: 0.52, width: 0.028, depth: 0.07, z: -0.14, delay: 0.22, partDir: s });
    wings.push({ kind: 'diamond', centerX: s * (hw + 0.45), centerY: -0.52, radiusX: 0.42, radiusY: 0.52, width: 0.028, depth: 0.07, z: -0.14, delay: 0.24, partDir: s });
    wings.push({ kind: 'diamond', centerX: s * (hw + 0.88), centerY: 0.0, radiusX: 0.46, radiusY: 0.62, width: 0.032, depth: 0.08, z: -0.26, delay: 0.28, partDir: s });
  }
  return wings;
}

function diamondGatewayRecipe(mainWidth: number): Motif[] {
  const hw = Math.max(4.3, mainWidth * 0.56 + 0.8);
  const hh = 1.75;
  return [
    { kind: 'ziggurat', halfWidth: hw + 0.75, halfHeight: hh + 0.65, step: 0.36, width: 0.032, depth: 0.08, z: 0.42, delay: 0.02 },
    { kind: 'cutOctagon', halfWidth: hw, halfHeight: hh, cut: 0.52, width: 0.064, depth: 0.12, z: 0.0, delay: 0.08, role: 'primary' },
    { kind: 'cutOctagon', halfWidth: hw - 0.18, halfHeight: hh - 0.16, cut: 0.44, width: 0.026, depth: 0.07, z: 0.06, delay: 0.14 },
    { kind: 'ziggurat', halfWidth: hw + 1.35, halfHeight: hh + 1.05, step: 0.44, width: 0.028, depth: 0.07, z: -0.52, delay: 0.18 },
    ...latticeWings(hw),
    { kind: 'splitRule', y: 0.72, innerX: 0.22, outerX: hw - 0.42, width: 0.024, depth: 0.06, z: 0.06, delay: 0.2 },
    { kind: 'splitRule', y: -0.72, innerX: 0.22, outerX: hw - 0.42, width: 0.024, depth: 0.06, z: 0.06, delay: 0.2 },
  ];
}

/* ---------------------------- Act V: hero lockup ---------------------------- */

function heroKeystone(hw: number, hh: number): Motif[] {
  const keyW = 0.92;
  const keyTop = hh + 0.74;
  const keyBot = hh - 0.02;
  const parts: Motif[] = [];
  for (const s of [-1, 1] as const) {
    parts.push({
      kind: 'path',
      spec: {
        points: [
          { x: 0, y: keyTop },
          { x: s * (keyW - 0.16), y: keyTop },
          { x: s * keyW, y: keyTop - 0.16 },
          { x: s * keyW, y: keyBot },
          { x: 0, y: keyBot },
        ],
        width: 0.044,
        depth: 0.1,
        z: 0.12,
        delay: 0.15,
        partDir: s,
      },
    });
    for (let b = 0; b < 3; b++) {
      const yBar = hh + 0.52 - b * 0.15;
      const lenBar = hw - 0.45 - b * 0.38;
      parts.push({
        kind: 'path',
        spec: {
          points: [
            { x: s * (keyW + 0.08), y: yBar },
            { x: s * lenBar, y: yBar },
          ],
          width: 0.024,
          depth: 0.06,
          z: 0.08,
          delay: 0.2 + b * 0.04,
          partDir: s,
        },
      });
    }
  }
  return parts;
}

function heroFlankingFiligree(hw: number): Motif[] {
  const filigree: Motif[] = [];
  for (const s of [-1, 1] as const) {
    filigree.push({ kind: 'diamond', centerX: s * (hw + 0.55), centerY: 0, radiusX: 0.38, radiusY: 0.68, width: 0.032, depth: 0.08, z: 0.04, delay: 0.28, partDir: s });
    filigree.push({ kind: 'diamond', centerX: s * (hw + 1.45), centerY: 0, radiusX: 0.52, radiusY: 0.95, width: 0.028, depth: 0.07, z: -0.45, delay: 0.32, partDir: s });
    filigree.push({
      kind: 'path',
      spec: {
        points: [
          { x: s * (hw + 0.92), y: 0 },
          { x: s * (hw + 2.45), y: 0 },
        ],
        width: 0.032,
        depth: 0.07,
        z: -0.25,
        delay: 0.34,
        partDir: s,
      },
    });
  }
  return filigree;
}

function heroLockupRecipe(mainWidth: number): Motif[] {
  const hw = Math.max(4.45, mainWidth * 0.54 + 0.78);
  const hh = 2.15;
  const keyTop = hh + 0.74;
  return [
    { kind: 'ziggurat', halfWidth: hw, halfHeight: hh, step: 0.32, width: 0.068, depth: 0.13, z: 0.0, delay: 0.0, role: 'primary' },
    { kind: 'ziggurat', halfWidth: hw - 0.15, halfHeight: hh - 0.14, step: 0.28, width: 0.026, depth: 0.08, z: 0.05, delay: 0.06 },
    { kind: 'ziggurat', halfWidth: hw - 0.27, halfHeight: hh - 0.25, step: 0.24, width: 0.022, depth: 0.06, z: 0.08, delay: 0.11 },
    { kind: 'cutOctagon', halfWidth: hw + 0.36, halfHeight: hh + 0.32, cut: 0.68, width: 0.036, depth: 0.09, z: -0.32, delay: 0.14 },
    { kind: 'cutOctagon', halfWidth: hw + 0.78, halfHeight: hh + 0.68, cut: 0.92, width: 0.026, depth: 0.07, z: -0.68, delay: 0.2 },
    ...heroKeystone(hw, hh),
    { kind: 'splitRule', y: 0.84, innerX: 0.24, outerX: hw - 0.38, width: 0.034, depth: 0.08, z: 0.09, delay: 0.18 },
    { kind: 'splitRule', y: 0.73, innerX: 0.24, outerX: hw - 0.48, width: 0.02, depth: 0.05, z: 0.09, delay: 0.22 },
    { kind: 'diamond', centerX: 0, centerY: 0.785, radiusX: 0.22, radiusY: 0.12, width: 0.028, depth: 0.08, z: 0.11, delay: 0.24, partDir: 1 },
    { kind: 'splitRule', y: -1.52, innerX: 0.24, outerX: hw - 0.42, width: 0.028, depth: 0.07, z: 0.09, delay: 0.2 },
    { kind: 'diamond', centerX: 0, centerY: -1.52, radiusX: 0.22, radiusY: 0.12, width: 0.028, depth: 0.08, z: 0.11, delay: 0.25, partDir: -1 },
    { kind: 'chevronWings', startX: hw + 0.22, count: 4, spacing: 0.34, wingWidth: 0.62, wingHeight: 1.55, width: 0.038, depth: 0.09, z: -0.18, delay: 0.24 },
    ...heroFlankingFiligree(hw),
    { kind: 'sunburst', centerX: 0, centerY: keyTop + 0.04, innerRadius: 0.32, outerRadius: 1.75, rays: 15, spread: Math.PI * 0.84, direction: 'up', width: 0.03, depth: 0.08, z: -0.18, delay: 0.28 },
    { kind: 'sunburst', centerX: 0, centerY: -hh - 0.04, innerRadius: 0.38, outerRadius: 1.45, rays: 11, spread: Math.PI * 0.72, direction: 'down', width: 0.028, depth: 0.07, z: -0.18, delay: 0.3 },
  ];
}
