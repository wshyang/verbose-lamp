// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sparkles } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import type { SpectaclePreview } from '../hooks/useSpectaclePreview';
import { KeepClearSpeaker } from './KeepClearSpeaker';
import { OriginCrosshair } from './OriginCrosshair';
import { ActionButton } from './PanelBits';
import { PickOriginHint } from './PickOriginHint';
import { SpectaclePreviewLauncher } from './SpectaclePreviewLauncher';
import { SpectaclePreviewPanel } from './SpectaclePreviewPanel';

function fixture(overrides: Record<string, unknown> = {}): SpectaclePreview {
  return {
    open: true,
    setOpen: vi.fn(),
    qualityTier: 'high',
    playing: new Set(['fireworks', 'countdown', 'sparkler-sides', 'sunburst-iris']),
    toggleFireworks: vi.fn(), playFinale: vi.fn(), toggleSearchlights: vi.fn(), toggleChampagne: vi.fn(),
    playSparkler: vi.fn(), playSunburst: vi.fn(), demoScreen: 'A',
    playConfetti: vi.fn(), playCountdown: vi.fn(), playNameReveal: vi.fn(),
    marqueeOn: true, setMarqueeOn: vi.fn(),
    picking: false, setPicking: vi.fn(), origin: { x: 0.25, y: 0.75 },
    intensity: 0.6, setIntensity: vi.fn(), seed: 7, setSeed: vi.fn(), rerollSeed: vi.fn(),
    keepClearOn: false, setKeepClearOn: vi.fn(),
    simulatedReducedMotion: false, setSimulatedReducedMotion: vi.fn(), stopAll: vi.fn(),
    navText: '✦,One\n◆,Two', setNavText: vi.fn(),
    navValidation: { ok: true, items: [] },
    navItems: [
      { id: 'one', emoji: '✦', label: 'One' },
      { id: 'two', emoji: '◆', label: 'Two' },
    ],
    latticeDensity: 0.7, setLatticeDensity: vi.fn(), latticeLevel: 3,
    setLatticeLevel: vi.fn(), rerollLattice: vi.fn(), latticeSeed: 99,
    ...overrides,
  } as unknown as SpectaclePreview;
}

describe('SpectaclePreviewPanel', () => {
  it('renders every section on the left and forwards all controls', async () => {
    const user = userEvent.setup();
    const preview = fixture();
    const onOpenDraw = vi.fn();
    render(<SpectaclePreviewPanel preview={preview} onOpenDraw={onOpenDraw} placement="left" />);
    expect(screen.getByTestId('spectacle-preview__panel').className).toContain('left-3');
    expect(screen.getByTestId('spectacle-preview__quality').textContent).toContain('HIGH');

    await user.click(screen.getByTestId('spectacle-preview__fireworks'));
    await user.click(screen.getByTestId('spectacle-preview__finale'));
    await user.click(screen.getByTestId('spectacle-preview__searchlights'));
    await user.click(screen.getByTestId('spectacle-preview__champagne'));
    await user.click(screen.getAllByTestId('spectacle-preview__sparkler')[0]);
    await user.click(screen.getAllByTestId('spectacle-preview__sunburst')[0]);
    await user.click(screen.getAllByTestId('spectacle-preview__confetti')[0]);
    await user.click(screen.getAllByTestId('spectacle-preview__confetti')[1]);
    await user.click(screen.getByTestId('spectacle-preview__countdown'));
    await user.click(screen.getByTestId('spectacle-preview__name-reveal'));
    await user.click(screen.getByTestId('spectacle-preview__marquee'));
    await user.click(screen.getByTestId('spectacle-preview__lucky-draw'));
    await user.click(screen.getByTestId('spectacle-preview__pick-origin'));
    fireEvent.change(screen.getByTestId('spectacle-preview__intensity'), { target: { value: '0.8' } });
    fireEvent.change(screen.getByTestId('spectacle-preview__seed'), { target: { value: '42' } });
    fireEvent.change(screen.getByTestId('spectacle-preview__seed'), { target: { value: '' } });
    await user.click(screen.getByTestId('spectacle-preview__reroll'));
    await user.click(screen.getByTestId('spectacle-preview__keep-clear'));
    await user.click(screen.getByTestId('spectacle-preview__reduced-motion'));
    await user.click(screen.getByTestId('spectacle-preview__stop-all'));
    fireEvent.change(screen.getByTestId('spectacle-preview__nav-lines'), { target: { value: '✦,New' } });
    fireEvent.change(screen.getByTestId('spectacle-preview__lattice-density'), { target: { value: '0.4' } });
    fireEvent.change(screen.getByTestId('spectacle-preview__lattice-level'), { target: { value: '2' } });
    await user.click(screen.getByTestId('spectacle-preview__lattice-reroll'));
    await user.click(screen.getByTestId('spectacle-preview__close'));

    expect(preview.playSparkler).toHaveBeenCalledWith('sparkler-sides-outward', 'sides', 'outward');
    expect(preview.playConfetti).toHaveBeenCalledWith('rain');
    expect(preview.setSeed).toHaveBeenCalledWith(1925);
    expect(preview.setOpen).toHaveBeenCalledWith(false);
    expect(onOpenDraw).toHaveBeenCalledOnce();
    expect(screen.getByTestId('spectacle-preview__demo-screen').textContent).toContain('SCREEN A');
  });

  it('defaults right, reports an unknown tier and B screen, and lists nav issues', () => {
    const preview = fixture({
      qualityTier: null,
      demoScreen: 'B',
      picking: true,
      navValidation: { ok: false, issues: ['Too many items'] },
    });
    render(<SpectaclePreviewPanel preview={preview} onOpenDraw={vi.fn()} />);
    expect(screen.getByTestId('spectacle-preview__panel').className).toContain('right-3');
    expect(screen.getByTestId('spectacle-preview__quality').textContent).toContain('— TIER');
    expect(screen.getByTestId('spectacle-preview__pick-origin').textContent).toContain('Click the stage');
    expect(screen.getByTestId('spectacle-preview__demo-screen').textContent).toContain('SCREEN B');
    expect(screen.getByTestId('spectacle-preview__nav-issues').textContent).toContain('Too many items');
  });

  it('renders nothing when closed', () => {
    render(<SpectaclePreviewPanel preview={fixture({ open: false })} onOpenDraw={vi.fn()} />);
    expect(screen.queryByTestId('spectacle-preview__panel')).toBeNull();
  });
});

describe('preview launcher and stage helpers', () => {
  it('covers open/closed launcher states and disabled action buttons', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { rerender } = render(<SpectaclePreviewLauncher open={false} onToggle={onToggle} />);
    await user.click(screen.getByTestId('spectacle-preview__launch'));
    rerender(<SpectaclePreviewLauncher open onToggle={onToggle} />);
    expect(screen.getByTestId('spectacle-preview__launch').getAttribute('aria-expanded')).toBe('true');
    render(<ActionButton label="Disabled" icon={Sparkles} onClick={vi.fn()} disabled testId="spectacle-preview__sparkler" />);
    expect((screen.getAllByTestId('spectacle-preview__sparkler')[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders crosshair states, hint defaults, and a draggable speaker', () => {
    const onMove = vi.fn();
    const capture = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: capture });
    const { rerender } = render(
      <>
        <OriginCrosshair origin={{ x: 0.2, y: 0.4 }} isPicking={false} />
        <PickOriginHint />
        <KeepClearSpeaker rect={{ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }} onMove={onMove} />
      </>
    );
    expect(screen.getByTestId('spectacle-preview__crosshair').style.left).toBe('20%');
    rerender(
      <>
        <OriginCrosshair origin={{ x: 0.2, y: 0.4 }} isPicking testId="custom-crosshair" />
        <PickOriginHint testId="custom-hint" />
        <KeepClearSpeaker rect={{ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }} onMove={onMove} testId="custom-speaker" />
      </>
    );
    expect(screen.getByTestId('custom-crosshair')).toBeTruthy();

    const speaker = screen.getByTestId('custom-speaker');
    fireEvent.pointerDown(speaker, { pointerId: 3 });
    fireEvent.pointerMove(speaker, { movementX: window.innerWidth / 2, movementY: window.innerHeight / 2 });
    fireEvent.pointerUp(speaker);
    expect(capture).toHaveBeenCalledWith(3);
    expect(onMove).toHaveBeenCalledWith(0.5, 0.5);
  });
});
