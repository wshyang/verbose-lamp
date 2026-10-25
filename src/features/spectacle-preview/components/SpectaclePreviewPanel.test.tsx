// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { setupDomTests } from '@/test/dom';
import { CelebrationSection } from './CelebrationSection';
import { BackdropSection } from './BackdropSection';
import { StageSettingsSection } from './StageSettingsSection';
import { TransitionsSection } from './TransitionsSection';
import { GoldUiSection, LatticeSection } from './PanelExtras';
import { SpectaclePreviewPanel } from './SpectaclePreviewPanel';
import { SPARKLER_DEMOS } from '../data/previewCatalogue';
import { stubPreview } from '../testing/stubPreview';

setupDomTests();

describe('SpectaclePreviewPanel', () => {
  it('renders nothing while closed', () => {
    render(<SpectaclePreviewPanel preview={stubPreview({ open: false })} onOpenDraw={() => {}} />);
    expect(screen.queryByTestId('spectacle-preview__panel')).toBeNull();
  });

  it('docks every section and shows the quality tier', () => {
    render(<SpectaclePreviewPanel preview={stubPreview()} onOpenDraw={() => {}} />);
    const panel = screen.getByTestId('spectacle-preview__panel');
    expect(panel.textContent).toContain('BACKDROP');
    expect(panel.textContent).toContain('TRANSITIONS');
    expect(panel.textContent).toContain('CELEBRATION');
    expect(panel.textContent).toContain('LUCKY DRAW');
    expect(panel.textContent).toContain('STAGE SETTINGS');
    expect(panel.textContent).toContain('GOLD UI KIT');
    expect(panel.textContent).toContain('DECO LATTICE');
    expect(screen.getByTestId('spectacle-preview__quality').textContent).toContain('HIGH');
  });

  it('shows an em dash when the tier is not resolved yet', () => {
    render(<SpectaclePreviewPanel preview={stubPreview({ qualityTier: null })} onOpenDraw={() => {}} />);
    expect(screen.getByTestId('spectacle-preview__quality').textContent).toContain('—');
  });

  it('closes from the header button and opens the drum from the lucky-draw row', async () => {
    const setOpen = vi.fn();
    const onOpenDraw = vi.fn();
    render(<SpectaclePreviewPanel preview={stubPreview({ setOpen })} onOpenDraw={onOpenDraw} />);

    await userEvent.click(screen.getByTestId('spectacle-preview__close'));
    await userEvent.click(screen.getByTestId('spectacle-preview__lucky-draw'));

    expect(setOpen).toHaveBeenCalledWith(false);
    expect(onOpenDraw).toHaveBeenCalledTimes(1);
  });
});

describe('BackdropSection', () => {
  it('wires the four ambient effects and marks the live ones', async () => {
    const toggleFireworks = vi.fn();
    const playFinale = vi.fn();
    const toggleSearchlights = vi.fn();
    const toggleChampagne = vi.fn();
    render(
      <BackdropSection
        preview={stubPreview({
          toggleFireworks,
          playFinale,
          toggleSearchlights,
          toggleChampagne,
          playing: new Set(['fireworks']),
        })}
      />,
    );

    for (const testId of ['fireworks', 'finale', 'searchlights', 'champagne']) {
      await userEvent.click(screen.getByTestId(`spectacle-preview__${testId}`));
    }

    expect([toggleFireworks, playFinale, toggleSearchlights, toggleChampagne].map((spy) => spy.mock.calls.length)).toEqual([1, 1, 1, 1]);
    expect(screen.getByTestId('spectacle-preview__fireworks').className).toContain('border-[#f2d38a]');
    expect(screen.getByTestId('spectacle-preview__finale').className).not.toContain('border-[#f2d38a]');
  });
});

describe('TransitionsSection', () => {
  it('passes each orb demo through with its own key', async () => {
    const playOrb = vi.fn();
    render(<TransitionsSection preview={stubPreview({ playOrb })} />);

    const buttons = screen.getAllByTestId('spectacle-preview__orb');
    expect(buttons).toHaveLength(4);
    await userEvent.click(buttons[1]);

    expect(playOrb).toHaveBeenCalledWith('orb-sides-inward', 'sides', 'inward');
  });

  it('swaps the A/B demo screen under the orb cover', async () => {
    const playSunburst = vi.fn();
    render(<TransitionsSection preview={stubPreview({ demoScreen: 'B', playSunburst })} />);

    const screenBox = screen.getByTestId('spectacle-preview__demo-screen');
    expect(screenBox.textContent).toContain('SCREEN B');

    await userEvent.click(screen.getAllByTestId('spectacle-preview__sunburst')[0]);
    expect(playSunburst).toHaveBeenCalledWith('sunburst-iris', 'iris');
  });
});

describe('CelebrationSection', () => {
  it('plays both confetti modes and the countdown', async () => {
    const playConfetti = vi.fn();
    const playCountdown = vi.fn();
    render(<CelebrationSection preview={stubPreview({ playConfetti, playCountdown })} />);

    const confetti = screen.getAllByTestId('spectacle-preview__confetti');
    await userEvent.click(confetti[0]);
    await userEvent.click(confetti[1]);
    await userEvent.click(screen.getByTestId('spectacle-preview__countdown'));

    expect(playConfetti.mock.calls).toEqual([['burst'], ['rain']]);
    expect(playCountdown).toHaveBeenCalledTimes(1);
  });

  it('drives the sparkler demos from the catalogue', async () => {
    const playSparklers = vi.fn();
    render(<CelebrationSection preview={stubPreview({ playSparklers })} />);

    const buttons = screen.getAllByTestId('spectacle-preview__sparkler');
    expect(buttons).toHaveLength(SPARKLER_DEMOS.length);
    for (const button of buttons) await userEvent.click(button);

    expect(playSparklers.mock.calls).toEqual(SPARKLER_DEMOS.map((demo) => [demo.count]));
  });

  it('toggles the marquee bulb border', async () => {
    const setMarqueeOn = vi.fn();
    render(<CelebrationSection preview={stubPreview({ marqueeOn: true, setMarqueeOn })} />);

    await userEvent.click(screen.getByTestId('spectacle-preview__marquee'));
    expect(setMarqueeOn).toHaveBeenCalledWith(false);
  });
});

describe('StageSettingsSection', () => {
  it('labels the origin and arms picking', async () => {
    const setPicking = vi.fn();
    render(<StageSettingsSection preview={stubPreview({ setPicking })} />);

    const pick = screen.getByTestId('spectacle-preview__pick-origin');
    expect(pick.textContent).toContain('Origin 0.50 · 0.42');
    await userEvent.click(pick);
    expect(setPicking).toHaveBeenCalledWith(true);
  });

  it('announces picking in the button label', () => {
    render(<StageSettingsSection preview={stubPreview({ picking: true })} />);
    expect(screen.getByTestId('spectacle-preview__pick-origin').textContent).toContain('Click the stage');
  });

  it('edits intensity, seed and the keep-clear / reduced-motion toggles', async () => {
    const setIntensity = vi.fn();
    const setSeed = vi.fn();
    const setKeepClearOn = vi.fn();
    const setSimulatedReducedMotion = vi.fn();
    const stopAll = vi.fn();
    render(
      <StageSettingsSection
        preview={stubPreview({ setIntensity, setSeed, setKeepClearOn, setSimulatedReducedMotion, stopAll })}
      />,
    );

    fireEvent.change(screen.getByTestId('spectacle-preview__intensity'), { target: { value: '0.35' } });
    expect(setIntensity).toHaveBeenCalledWith(0.35);

    fireEvent.change(screen.getByTestId('spectacle-preview__seed'), { target: { value: '77' } });
    expect(setSeed).toHaveBeenCalledWith(77);

    await userEvent.click(screen.getByTestId('spectacle-preview__keep-clear'));
    expect(setKeepClearOn).toHaveBeenCalledWith(true);

    await userEvent.click(screen.getByTestId('spectacle-preview__reduced-motion'));
    expect(setSimulatedReducedMotion).toHaveBeenCalledWith(true);

    await userEvent.click(screen.getByTestId('spectacle-preview__stop-all'));
    expect(stopAll).toHaveBeenCalledTimes(1);
  });

  it('falls back to the default seed when the field is emptied', () => {
    const setSeed = vi.fn();
    render(<StageSettingsSection preview={stubPreview({ setSeed })} />);

    fireEvent.change(screen.getByTestId('spectacle-preview__seed'), { target: { value: '' } });

    expect(setSeed).toHaveBeenCalledWith(1925);
  });

  it('rerolls the seed', async () => {
    const rerollSeed = vi.fn();
    render(<StageSettingsSection preview={stubPreview({ rerollSeed })} />);
    await userEvent.click(screen.getByTestId('spectacle-preview__reroll'));
    expect(rerollSeed).toHaveBeenCalledTimes(1);
  });
});

describe('GoldUiSection', () => {
  it('edits the nav lines and renders the live bar', async () => {
    const setNavText = vi.fn();
    render(<GoldUiSection preview={stubPreview({ setNavText })} />);

    const textarea = screen.getByTestId('spectacle-preview__nav-lines') as HTMLTextAreaElement;
    expect(textarea.value).toContain('Lucky Draw');
    expect(screen.getByLabelText('Gold UI sample')).toBeTruthy();
    expect(screen.queryByTestId('spectacle-preview__nav-issues')).toBeNull();

    fireEvent.change(textarea, { target: { value: '🥂,Toast' } });
    expect(setNavText).toHaveBeenCalledWith('🥂,Toast');
  });

  it('lists validation issues when the lines are unusable', () => {
    const preview = stubPreview();
    render(
      <GoldUiSection
        preview={{ ...preview, navValidation: { ok: false, issues: ['line 1 has no label'] } }}
      />,
    );

    const issues = screen.getByTestId('spectacle-preview__nav-issues');
    expect(issues.textContent).toContain('line 1 has no label');
  });
});

describe('LatticeSection', () => {
  it('drives density, level and the seed reroll', async () => {
    const setLatticeDensity = vi.fn();
    const setLatticeLevel = vi.fn();
    const rerollLattice = vi.fn();
    render(
      <LatticeSection preview={stubPreview({ latticeSeed: 4242, setLatticeDensity, setLatticeLevel, rerollLattice })} />,
    );

    fireEvent.change(screen.getByTestId('spectacle-preview__lattice-density'), { target: { value: '0.25' } });
    expect(setLatticeDensity).toHaveBeenCalledWith(0.25);

    fireEvent.change(screen.getByTestId('spectacle-preview__lattice-level'), { target: { value: '2' } });
    expect(setLatticeLevel).toHaveBeenCalledWith(2);

    const reroll = screen.getByTestId('spectacle-preview__lattice-reroll');
    expect(reroll.textContent).toContain('seed 4242');
    await userEvent.click(reroll);
    expect(rerollLattice).toHaveBeenCalledTimes(1);
  });
});
