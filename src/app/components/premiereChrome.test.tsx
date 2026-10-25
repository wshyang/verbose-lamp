// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createPremiereStore } from '@/features/premiere/scene3d/premiereStore';
import { CinematicStage } from './CinematicStage';
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

describe('CinematicStage', () => {
  it('publishes frame readiness and switches cinema/orbit and HUD classes', () => {
    const store = createPremiereStore({ freezeAt: null });
    const { rerender } = render(<CinematicStage store={store} cameraMode="cinema" hudHidden={false} />);
    expect(screen.getByTestId('cinematic-stage__canvas').dataset.frameReady).toBe('false');
    act(() => store.getState().markFrameReady());
    expect(screen.getByTestId('cinematic-stage__canvas').dataset.frameReady).toBe('true');
    rerender(<CinematicStage store={store} cameraMode="orbit" hudHidden />);
    expect(screen.getByTestId('cinematic-stage__canvas').className).toContain('cursor-grab');
    expect(document.querySelector('.opacity-0')).toBeTruthy();
  });
});

describe('FrameStudioDock', () => {
  it('passes the full controller to the open control and hides with the HUD', () => {
    const current = studio(true);
    const { container } = render(<FrameStudioDock studio={current} hudHidden />);
    expect(screen.getByText('Frame studio control mock')).toBeTruthy();
    expect(container.firstElementChild?.className).toContain('opacity-0');
    expect(dock.controlProps).toMatchObject({
      isOpen: true, onDismiss: (current as unknown as { dismiss: unknown }).dismiss,
      onRerollSeed: (current as unknown as { rerollSeed: unknown }).rerollSeed,
      onBorderPatternChange: (current as unknown as { setBorderPattern: unknown }).setBorderPattern,
    });
  });

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
