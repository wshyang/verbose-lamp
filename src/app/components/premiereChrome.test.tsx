// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FloatingHudToggle } from './FloatingHudToggle';
import { FrameStudioDock } from './FrameStudioDock';
import { OrbitHint } from './OrbitHint';

const dock = vi.hoisted(() => ({ controlProps: undefined as never }));

vi.mock('@/features/premiere', () => ({
  PremiereCanvas: () => <canvas aria-label="Mock premiere canvas" />,
}));
vi.mock('@/features/frame-studio', () => ({
  FrameStudioControl: (props: never) => {
    dock.controlProps = props;
    return <div>Frame studio control mock</div>;
  },
}));

function studio(isOpen: boolean) {
  return {
    isOpen, surface: 'title-cards', patterns: [], baseSource: 'authored', layers: [],
    designGallery: [], activeDesignIndex: null, designLabel: 'Signature', level: 2,
    detailPercent: 50, detailPresets: [], activePreset: null, isDesignPattern: true,
    isLatticePattern: false, latticeSeed: 1925, proportionsOpen: false, genome: {},
    borderEnabled: false, borderWeight: 50, borderPattern: 'poster',
    setSurface: vi.fn(), selectPattern: vi.fn(), setLayerEnabled: vi.fn(), setLayerLevel: vi.fn(),
    selectDesign: vi.fn(), setLevel: vi.fn(), setDetail: vi.fn(), setProportionsOpen: vi.fn(),
    setGene: vi.fn(), setBorderEnabled: vi.fn(), setBorderWeight: vi.fn(), setBorderPattern: vi.fn(),
    rerollSeed: vi.fn(), resetAll: vi.fn(), dismiss: vi.fn(), reveal: vi.fn(),
  } as never;
}

describe('FrameStudioDock', () => {
  it('shows a reveal button when closed', async () => {
    const user = userEvent.setup();
    const current = studio(false);
    const { container } = render(<FrameStudioDock studio={current} hudHidden={false} />);
    expect(container.firstElementChild?.className).toContain('opacity-100');
    await user.click(screen.getByTestId('frame-studio__reveal'));
    expect((current as unknown as { reveal: ReturnType<typeof vi.fn> }).reveal).toHaveBeenCalledOnce();
  });
});

describe('small premiere chrome', () => {
  it('renders or hides the orbit hint', () => {
    const { rerender } = render(<OrbitHint isVisible={false} />);
    expect(document.body.textContent).toBe('');
    rerender(<OrbitHint isVisible />);
    expect(screen.getByText(/Drag to Orbit/)).toBeTruthy();
  });

  it('labels the floating HUD toggle in both states', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { rerender } = render(<FloatingHudToggle isHidden={false} onToggle={onToggle} />);
    expect(screen.getByTestId('premiere-hud__toggle').getAttribute('aria-label')).toBe('Hide cinema controls');
    await user.click(screen.getByTestId('premiere-hud__toggle'));
    rerender(<FloatingHudToggle isHidden onToggle={onToggle} />);
    expect(screen.getByTestId('premiere-hud__toggle').getAttribute('aria-label')).toBe('Show cinema controls');
  });
});
