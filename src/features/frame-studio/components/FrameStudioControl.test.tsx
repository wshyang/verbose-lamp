// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFakeFrameStudio } from '@/test/fakeFrameStudio';
import type { FrameStudioController } from '../hooks/useFrameStudio';
import { FrameStudioControl } from './FrameStudioControl';

function renderControl(studio: FrameStudioController) {
  render(
    <FrameStudioControl
      isOpen={studio.isOpen}
      surface={studio.surface}
      patterns={studio.patterns}
      baseSource={studio.baseSource}
      layers={studio.layers}
      designGallery={studio.designGallery}
      activeDesignIndex={studio.activeDesignIndex}
      designLabel={studio.designLabel}
      level={studio.level}
      detailPercent={studio.detailPercent}
      detailPresets={studio.detailPresets}
      activePreset={studio.activePreset}
      isDesignPattern={studio.isDesignPattern}
      proportionsOpen={studio.proportionsOpen}
      genome={studio.genome}
      borderEnabled={studio.borderEnabled}
      borderWeight={studio.borderWeight}
      borderPattern={studio.borderPattern}
      isLatticeActive={studio.isLatticeActive}
      onSurfaceChange={studio.setSurface}
      onPatternChange={studio.selectPattern}
      onLayerToggle={studio.setLayerEnabled}
      onLayerLevelChange={studio.setLayerLevel}
      onDesignChange={studio.selectDesign}
      onLevelChange={studio.setLevel}
      onDetailChange={studio.setDetail}
      onProportionsToggle={studio.setProportionsOpen}
      onGeneChange={studio.setGene}
      onBorderEnabledChange={studio.setBorderEnabled}
      onBorderWeightChange={studio.setBorderWeight}
      onBorderPatternChange={studio.setBorderPattern}
      onRerollPattern={studio.rerollPattern}
      onReset={studio.resetAll}
      onDismiss={studio.dismiss}
    />,
  );
  return studio;
}

describe('FrameStudioControl', () => {
  it('lists every genesis pattern including Deco Lattice and selects them', () => {
    const studio = renderControl(createFakeFrameStudio());
    const patterns = screen.getAllByTestId('frame-studio__pattern');
    expect(patterns.map((p) => p.textContent?.trim())).toContain('Deco Lattice');
    fireEvent.click(patterns[patterns.length - 1]);
    expect(studio.selectPattern).toHaveBeenCalledWith('lattice');
  });

  it('shows the pattern reroll only while the lattice is active', () => {
    const studio = renderControl(createFakeFrameStudio({ isLatticeActive: true, baseSource: 'lattice', isDesignPattern: false }));
    fireEvent.click(screen.getByTestId('frame-studio__reroll'));
    expect(studio.rerollPattern).toHaveBeenCalledOnce();
  });

  it('applies detail presets and dismisses through its testids', () => {
    const studio = renderControl(createFakeFrameStudio());
    const presets = screen.getAllByTestId('frame-studio__detail-preset');
    fireEvent.click(presets[presets.length - 1]);
    expect(studio.setDetail).toHaveBeenCalledWith(100);
    fireEvent.click(screen.getByTestId('frame-studio__dismiss'));
    expect(studio.dismiss).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId('frame-studio__reset'));
    expect(studio.resetAll).toHaveBeenCalledOnce();
  });

  it('switching to the border surface swaps in the border panel and pattern chips', () => {
    const studio = renderControl(createFakeFrameStudio({ surface: 'screen-border', borderEnabled: true }));
    expect(screen.getByTestId('frame-studio__border-blurb')).toBeTruthy();
    expect(screen.queryAllByTestId('frame-studio__pattern')).toHaveLength(0);
    fireEvent.click(screen.getByTestId('frame-studio__border-pattern-lattice'));
    expect(studio.setBorderPattern).toHaveBeenCalledWith('lattice');
    fireEvent.click(screen.getByTestId('frame-studio__surface-sequence'));
    expect(studio.setSurface).toHaveBeenCalledWith('title-cards');
  });

  it('renders nothing when closed', () => {
    renderControl(createFakeFrameStudio({ isOpen: false }));
    expect(screen.queryByTestId('frame-studio__panel')).toBeNull();
  });
});
