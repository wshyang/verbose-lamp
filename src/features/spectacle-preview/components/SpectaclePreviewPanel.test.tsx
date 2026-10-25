// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { parseNavLines, validateNavItems } from '@/features/gilded-ui';
import { DEFAULT_NAV_LINES } from '../data/previewCatalogue';
import type { SpectaclePreview } from '../hooks/useSpectaclePreview';
import { SpectaclePreviewLauncher } from './SpectaclePreviewLauncher';
import { SpectaclePreviewPanel } from './SpectaclePreviewPanel';

function createPreview(overrides: Partial<SpectaclePreview> = {}) {
  const navItems = validateNavItems(parseNavLines(DEFAULT_NAV_LINES));
  const handlers = {
    setOpen: vi.fn(),
    setMarqueeOn: vi.fn(),
    stopAll: vi.fn(),
    setPicking: vi.fn(),
    setIntensity: vi.fn(),
    setSeed: vi.fn(),
    rerollSeed: vi.fn(),
    setKeepClearOn: vi.fn(),
    setSimulatedReducedMotion: vi.fn(),
    toggleFireworks: vi.fn(),
    playFinale: vi.fn(),
    toggleSearchlights: vi.fn(),
    toggleChampagne: vi.fn(),
    playOrb: vi.fn(),
    playSunburst: vi.fn(),
    playConfetti: vi.fn(),
    playCountdown: vi.fn(),
    playNameReveal: vi.fn(),
    setNavText: vi.fn(),
    rerollLattice: vi.fn(),
    setLatticeDensity: vi.fn(),
    setLatticeLevel: vi.fn(),
  };
  const preview = {
    open: true,
    playing: new Set<string>(),
    qualityTier: 'high',
    marqueeOn: true,
    origin: { x: 0.5, y: 0.42 },
    picking: false,
    intensity: 0.6,
    seed: 1925,
    keepClearOn: false,
    keepClear: [],
    speaker: { x: 0.42, y: 0.28, w: 0.16, h: 0.24 },
    simulatedReducedMotion: false,
    demoScreen: 'A',
    navText: DEFAULT_NAV_LINES,
    navValidation: navItems,
    navItems: navItems.ok ? navItems.items : [],
    latticeSeed: 1925,
    latticeDensity: 0.7,
    latticeLevel: 4,
    ...handlers,
    ...overrides,
  };
  return { preview: preview as unknown as SpectaclePreview, handlers };
}

const onOpenDraw = vi.fn();

describe('SpectaclePreviewLauncher', () => {
  it('announces whether the console is expanded', async () => {
    const onToggle = vi.fn();
    const { rerender } = render(<SpectaclePreviewLauncher open={false} onToggle={onToggle} />);
    const button = screen.getByTestId('spectacle-preview__launch');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.className).toContain('text-[#d8b878]');
    await userEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<SpectaclePreviewLauncher open onToggle={onToggle} />);
    expect(screen.getByTestId('spectacle-preview__launch').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('spectacle-preview__launch').className).toContain('bg-gradient-to-b');
  });
});

describe('SpectaclePreviewPanel', () => {
  it('renders nothing while closed', () => {
    const { preview } = createPreview({ open: false });
    render(<SpectaclePreviewPanel preview={preview} onOpenDraw={onOpenDraw} />);
    expect(screen.queryByTestId('spectacle-preview__panel')).toBeNull();
  });

  it('shows the quality tier and closes from its header', async () => {
    const { preview, handlers } = createPreview();
    render(<SpectaclePreviewPanel preview={preview} onOpenDraw={onOpenDraw} />);
    expect(screen.getByTestId('spectacle-preview__quality').textContent).toBe('HIGH TIER');
    await userEvent.click(screen.getByTestId('spectacle-preview__close'));
    expect(handlers.setOpen).toHaveBeenCalledWith(false);
  });

  it('drives every backdrop action', async () => {
    const { preview, handlers } = createPreview({ playing: new Set(['fireworks']) });
    render(<SpectaclePreviewPanel preview={preview} onOpenDraw={onOpenDraw} />);

    const fireworks = screen.getByTestId('spectacle-preview__fireworks');
    expect(fireworks.className).toContain('border-[#f2d38a]');
    await userEvent.click(fireworks);
    await userEvent.click(screen.getByTestId('spectacle-preview__finale'));
    await userEvent.click(screen.getByTestId('spectacle-preview__searchlights'));
    await userEvent.click(screen.getByTestId('spectacle-preview__champagne'));

    expect(handlers.toggleFireworks).toHaveBeenCalledTimes(1);
    expect(handlers.playFinale).toHaveBeenCalledTimes(1);
    expect(handlers.toggleSearchlights).toHaveBeenCalledTimes(1);
    expect(handlers.toggleChampagne).toHaveBeenCalledTimes(1);
  });

  it('plays each orb and sunburst demo and shows the A/B screen', async () => {
    const { preview, handlers } = createPreview({ demoScreen: 'B' });
    render(<SpectaclePreviewPanel preview={preview} onOpenDraw={onOpenDraw} />);

    const orbs = screen.getAllByTestId('spectacle-preview__orb');
    expect(orbs).toHaveLength(4);
    await userEvent.click(orbs[2]);
    expect(handlers.playOrb).toHaveBeenCalledWith('orb-corners-outward', 'corners', 'outward');

    const sunbursts = screen.getAllByTestId('spectacle-preview__sunburst');
    await userEvent.click(sunbursts[1]);
    expect(handlers.playSunburst).toHaveBeenCalledWith('sunburst-fan', 'fan');

    const screenTag = screen.getByTestId('spectacle-preview__demo-screen');
    expect(screenTag.textContent).toContain('SCREEN B');
    expect(screenTag.className).toContain('text-[#7fd9a0]');
  });

  it('runs the celebration buttons and the marquee toggle', async () => {
    const { preview, handlers } = createPreview();
    render(<SpectaclePreviewPanel preview={preview} onOpenDraw={onOpenDraw} />);

    const confetti = screen.getAllByTestId('spectacle-preview__confetti');
    await userEvent.click(confetti[0]);
    await userEvent.click(confetti[1]);
    await userEvent.click(screen.getByTestId('spectacle-preview__countdown'));
    await userEvent.click(screen.getByTestId('spectacle-preview__name-reveal'));
    await userEvent.click(screen.getByTestId('spectacle-preview__marquee'));

    expect(handlers.playConfetti).toHaveBeenNthCalledWith(1, 'burst');
    expect(handlers.playConfetti).toHaveBeenNthCalledWith(2, 'rain');
    expect(handlers.playCountdown).toHaveBeenCalledTimes(1);
    expect(handlers.playNameReveal).toHaveBeenCalledTimes(1);
    expect(handlers.setMarqueeOn).toHaveBeenCalledWith(false);
  });

  it('opens the lucky draw dialog from the panel', async () => {
    const { preview } = createPreview();
    render(<SpectaclePreviewPanel preview={preview} onOpenDraw={onOpenDraw} />);
    await userEvent.click(screen.getByTestId('spectacle-preview__lucky-draw'));
    expect(onOpenDraw).toHaveBeenCalledTimes(1);
  });

  it('edits the stage settings: origin, intensity, seed, keep-clear, reduced motion, stop', async () => {
    const { preview, handlers } = createPreview();
    render(<SpectaclePreviewPanel preview={preview} onOpenDraw={onOpenDraw} />);

    expect(screen.getByTestId('spectacle-preview__pick-origin').textContent).toContain('Origin 0.50');
    await userEvent.click(screen.getByTestId('spectacle-preview__pick-origin'));
    expect(handlers.setPicking).toHaveBeenCalledWith(true);

    fireEvent.change(screen.getByTestId('spectacle-preview__intensity'), { target: { value: '0.25' } });
    expect(handlers.setIntensity).toHaveBeenCalledWith(0.25);

    fireEvent.change(screen.getByTestId('spectacle-preview__seed'), { target: { value: '42' } });
    expect(handlers.setSeed).toHaveBeenCalledWith(42);
    fireEvent.change(screen.getByTestId('spectacle-preview__seed'), { target: { value: '0' } });
    expect(handlers.setSeed).toHaveBeenLastCalledWith(1925);

    await userEvent.click(screen.getByTestId('spectacle-preview__reroll'));
    expect(handlers.rerollSeed).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByTestId('spectacle-preview__keep-clear'));
    expect(handlers.setKeepClearOn).toHaveBeenCalledWith(true);
    await userEvent.click(screen.getByTestId('spectacle-preview__reduced-motion'));
    expect(handlers.setSimulatedReducedMotion).toHaveBeenCalledWith(true);

    await userEvent.click(screen.getByTestId('spectacle-preview__stop-all'));
    expect(handlers.stopAll).toHaveBeenCalledTimes(1);
  });

  it('labels the origin picker while picking', () => {
    const { preview } = createPreview({ picking: true });
    render(<SpectaclePreviewPanel preview={preview} onOpenDraw={onOpenDraw} />);
    expect(screen.getByTestId('spectacle-preview__pick-origin').textContent).toContain('Click the stage');
  });

  it('edits the gold nav lines and lists validation issues', async () => {
    const broken = validateNavItems(parseNavLines('nope'));
    const { preview, handlers } = createPreview({ navText: 'nope', navValidation: broken });
    render(<SpectaclePreviewPanel preview={preview} onOpenDraw={onOpenDraw} />);

    expect(screen.getByTestId('spectacle-preview__nav-issues')).toBeDefined();
    fireEvent.change(screen.getByTestId('spectacle-preview__nav-lines'), {
      target: { value: '🎷,Program' },
    });
    expect(handlers.setNavText).toHaveBeenCalledWith('🎷,Program');

    const navButtons = screen.getAllByTestId('gilded-nav-bar__item');
    await userEvent.click(navButtons[0]);
    expect(navButtons[0]).toBeDefined();
  });

  it('drives the lattice controls', async () => {
    const { preview, handlers } = createPreview();
    render(<SpectaclePreviewPanel preview={preview} onOpenDraw={onOpenDraw} />);

    fireEvent.change(screen.getByTestId('spectacle-preview__lattice-density'), {
      target: { value: '0.4' },
    });
    expect(handlers.setLatticeDensity).toHaveBeenCalledWith(0.4);

    fireEvent.change(screen.getByTestId('spectacle-preview__lattice-level'), { target: { value: '2' } });
    expect(handlers.setLatticeLevel).toHaveBeenCalledWith(2);

    await userEvent.click(screen.getByTestId('spectacle-preview__lattice-reroll'));
    expect(handlers.rerollLattice).toHaveBeenCalledTimes(1);
  });
});

describe('the console before a stage quality is known', () => {
  it('shows a dash instead of a tier', () => {
    const { preview } = createPreview({ qualityTier: null });
    render(<SpectaclePreviewPanel preview={preview} onOpenDraw={onOpenDraw} />);
    expect(screen.getByTestId('spectacle-preview__quality').textContent).toBe('— TIER');
  });
});
