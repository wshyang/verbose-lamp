// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { stubPreview } from '@/features/spectacle-preview/testing/stubPreview';
import type { SpectaclePreview } from '@/features/spectacle-preview';
import type { PremiereSpectacle } from '../hooks/usePremiereSpectacle';
import { PremiereSpectacleOverlay } from './PremiereSpectacleOverlay';

vi.mock('@/features/lucky-draw', () => ({
  LuckyDrawStage: () => <div data-testid="lucky-draw__stage" />,
}));

function overlay(preview: Partial<SpectaclePreview> = {}, isDrawOpen = false) {
  const spectacle = {
    preview: stubPreview(preview),
    isDrawOpen,
    openDraw: vi.fn(),
    closeDraw: vi.fn(),
    handleLanded: vi.fn(),
  } as unknown as PremiereSpectacle;
  return render(<PremiereSpectacleOverlay spectacle={spectacle} />);
}

describe('PremiereSpectacleOverlay stage markers', () => {
  it('shows the origin crosshair while the console is open', () => {
    overlay({ open: true });

    expect(screen.getByTestId('spectacle-preview__crosshair')).toBeTruthy();
  });

  it('hides the crosshair when the console is closed', () => {
    overlay({ open: false });

    expect(screen.queryByTestId('spectacle-preview__crosshair')).toBeNull();
  });

  it('places the crosshair at the chosen origin', () => {
    overlay({ open: true, origin: { x: 0.25, y: 0.75 } });

    const crosshair = screen.getByTestId('spectacle-preview__crosshair');
    expect(crosshair.style.left).toBe('25%');
    expect(crosshair.style.top).toBe('75%');
  });

  it('tells the user to click the stage while an origin is being picked', () => {
    overlay({ open: true, picking: true });

    expect(screen.getByTestId('spectacle-preview__pick-hint').textContent).toMatch(/click anywhere on the stage/i);
  });

  it('shows no pick hint when nothing is being picked', () => {
    overlay({ open: true, picking: false });

    expect(screen.queryByTestId('spectacle-preview__pick-hint')).toBeNull();
  });

  it('keeps the pick hint up after the console is closed mid-pick, since the stage is still waiting for the click', () => {
    overlay({ open: false, picking: true });

    expect(screen.getByTestId('spectacle-preview__pick-hint')).toBeTruthy();
  });

  it('shows the keep-clear speaker box only when it is switched on', () => {
    const { unmount } = overlay({ keepClearOn: false });
    expect(screen.queryByTestId('spectacle-preview__speaker')).toBeNull();
    unmount();

    overlay({ keepClearOn: true });
    expect(screen.getByTestId('spectacle-preview__speaker')).toBeTruthy();
  });

  it('places the speaker box at its rectangle', () => {
    overlay({ keepClearOn: true, speaker: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } });

    const box = screen.getByTestId('spectacle-preview__speaker');
    expect([box.style.left, box.style.top, box.style.width, box.style.height]).toEqual(['10%', '20%', '30%', '40%']);
  });

  it('still shows the lucky-draw dialog when it is open', () => {
    overlay({}, true);

    expect(screen.getByTestId('lucky-draw__stage')).toBeTruthy();
  });
});
