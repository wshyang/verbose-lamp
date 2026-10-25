import { describe, expect, it, vi } from 'vitest';
import { SIGNATURE_GENOME, DEFAULT_FRAME_STYLE, DEFAULT_SCREEN_BORDER_STYLE, clampGenome } from '@/features/art-deco-frame';
import { DESIGN_GALLERY, designAt } from '../data/frameDesigns';
import { nextPatternSeed } from './patternSeed';
import { borderActions, sequenceActions } from './studioActions';
import { defaultBorderStyle, defaultFrameFormula } from './studioFormula';

const intricacy = DEFAULT_FRAME_STYLE.intricacy;

function sequence() {
  const commit = vi.fn();
  const formula = defaultFrameFormula();
  return { commit, formula, actions: sequenceActions(formula, intricacy, commit) };
}

describe('sequenceActions', () => {
  it('commits a foundation change with the intricacy untouched', () => {
    const { commit, actions } = sequence();

    actions.selectPattern('lattice');

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0][0].source).toBe('lattice');
    expect(commit.mock.calls[0][1]).toBe(intricacy);
  });

  it('commits a gallery design genome, wrapping an index past the end', () => {
    const { commit, actions } = sequence();

    actions.selectDesign(2);

    expect(commit.mock.calls[0][0].genome).toEqual(designAt(2).genome);
  });

  it('edits one gene and leaves the rest', () => {
    const { commit, actions } = sequence();

    actions.setGene('rayDensity', 1.35);

    expect(commit.mock.calls[0][0].genome).toEqual({ ...SIGNATURE_GENOME, rayDensity: 1.35 });
  });

  it('clamps and rounds a layer level, but passes the enabled flag as given', () => {
    const { commit, actions } = sequence();
    const source = defaultFrameFormula().layers![0].source;

    actions.setLayerLevel(source, 9);
    actions.setLayerLevel(source, 2.6);
    actions.setLayerEnabled(source, true);

    const levels = commit.mock.calls.map((call) => call[0].layers!.find((l: { source: string }) => l.source === source));
    expect(levels[0].level).toBe(4);
    expect(levels[1].level).toBe(3);
    expect(levels[2].enabled).toBe(true);
  });

  it('commits the new base level in the formula', () => {
    const { commit, actions } = sequence();

    actions.setLevel(3);

    expect(commit.mock.calls[0][0].level).toBe(3);
  });

  it('turns detail percent into intricacy and leaves the formula as is', () => {
    const { commit, formula, actions } = sequence();

    actions.setDetail(75);
    actions.setDetail(400);

    expect(commit.mock.calls[0]).toEqual([formula, 0.75]);
    expect(commit.mock.calls[1]).toEqual([formula, 1]);
  });

  it('rerolls the seed along the deterministic sequence', () => {
    const { commit, actions } = sequence();

    actions.rerollPattern();

    expect(commit.mock.calls[0][0].seed).toBe(nextPatternSeed(undefined));
  });
});

describe('borderActions', () => {
  it('ignores the pattern the border already has, treating an unset one as poster', () => {
    const commit = vi.fn();
    const border = { ...defaultBorderStyle(), pattern: undefined };

    borderActions(border, commit).setBorderPattern('poster');

    expect(commit).not.toHaveBeenCalled();
  });

  it('commits a different pattern', () => {
    const commit = vi.fn();

    borderActions(defaultBorderStyle(), commit).setBorderPattern('lattice');

    expect(commit.mock.calls[0][0].pattern).toBe('lattice');
  });

  it('rerolls only the seed', () => {
    const commit = vi.fn();
    const border = defaultBorderStyle();

    borderActions(border, commit).rerollBorder();

    expect(commit.mock.calls[0][0]).toEqual({ ...border, seed: nextPatternSeed(border.seed) });
  });

  it('turns weight percent into a clamped unit weight', () => {
    const commit = vi.fn();
    const actions = borderActions(defaultBorderStyle(), commit);

    actions.setBorderWeight(80);
    actions.setBorderWeight(-5);

    expect(commit.mock.calls.map((call) => call[0].weight)).toEqual([0.8, 0]);
  });

  it('edits one gene of the border genome and not the shared signature', () => {
    const commit = vi.fn();

    borderActions(defaultBorderStyle(), commit).setGene('rayDensity', 1.4);

    expect(commit.mock.calls[0][0].genome.rayDensity).toBe(1.4);
    expect(SIGNATURE_GENOME.rayDensity).not.toBe(1.4);
    expect(DEFAULT_SCREEN_BORDER_STYLE.genome).not.toBe(commit.mock.calls[0][0].genome);
  });
});

describe('the design gallery', () => {
  it('only holds genomes already inside the allowed ranges, so adopting one never alters it', () => {
    for (let index = 0; index < DESIGN_GALLERY.length; index += 1) {
      expect(clampGenome(designAt(index).genome)).toEqual(designAt(index).genome);
    }
  });
});
