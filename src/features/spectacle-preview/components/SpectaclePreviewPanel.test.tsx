// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { stubPreview } from '../testing/stubPreview';
import { SpectaclePreviewPanel } from './SpectaclePreviewPanel';

describe('SpectaclePreviewPanel', () => {
  it('renders nothing while the console is closed', () => {
    render(<SpectaclePreviewPanel preview={stubPreview({ open: false })} onOpenDraw={vi.fn()} />);

    expect(screen.queryByTestId('spectacle-preview__panel')).toBeNull();
  });

  // The console is launched from inside the header, and the header carries a transform for its
  // hide transition. A transform makes its element the containing block for `position: fixed`
  // descendants, so a panel rendered inside it is positioned against the header, not the screen:
  // 2 px tall inside a 160 px bar instead of a full-height dock. Rendering into the body removes
  // every ancestor that could do that, now and after the next layout change.
  it('is rendered into the document body, outside whatever launched it', () => {
    const { container } = render(
      <header style={{ transform: 'translateY(0)' }} data-testid="transformed-host">
        <SpectaclePreviewPanel preview={stubPreview({ open: true })} onOpenDraw={vi.fn()} />
      </header>,
    );

    const panel = screen.getByTestId('spectacle-preview__panel');
    expect(container.contains(panel)).toBe(false);
    expect(panel.parentElement).toBe(document.body);
    expect(screen.getByTestId('transformed-host').contains(panel)).toBe(false);
  });

  it('docks on the left, so it can sit open beside the Frame Studio which owns the right edge', () => {
    render(<SpectaclePreviewPanel preview={stubPreview({ open: true })} onOpenDraw={vi.fn()} />);

    const classes = screen.getByTestId('spectacle-preview__panel').className.split(/\s+/);
    expect(classes).toContain('left-3');
    expect(classes).not.toContain('right-3');
  });

  it('stretches edge to edge on a phone, where a 320 px column would not fit beside anything', () => {
    render(<SpectaclePreviewPanel preview={stubPreview({ open: true })} onOpenDraw={vi.fn()} />);

    const classes = screen.getByTestId('spectacle-preview__panel').className.split(/\s+/);
    expect(classes).toContain('max-sm:right-3');
    expect(classes).toContain('max-sm:w-auto');
  });

  it('docks to a fixed edge, above the cinematic hud and the studio', () => {
    render(<SpectaclePreviewPanel preview={stubPreview({ open: true })} onOpenDraw={vi.fn()} />);

    const classes = screen.getByTestId('spectacle-preview__panel').className;
    expect(classes).toContain('fixed');
    expect(classes).toContain('z-[70]');
  });

  it('closes from its own header button', () => {
    const setOpen = vi.fn();
    render(<SpectaclePreviewPanel preview={stubPreview({ open: true, setOpen })} onOpenDraw={vi.fn()} />);

    fireEvent.click(screen.getByTestId('spectacle-preview__close'));

    expect(setOpen).toHaveBeenCalledWith(false);
  });

  it('opens the lucky draw from its own section', () => {
    const onOpenDraw = vi.fn();
    render(<SpectaclePreviewPanel preview={stubPreview({ open: true })} onOpenDraw={onOpenDraw} />);

    fireEvent.click(screen.getByTestId('spectacle-preview__lucky-draw'));

    expect(onOpenDraw).toHaveBeenCalledTimes(1);
  });

  it('shows the quality tier it is running at', () => {
    render(<SpectaclePreviewPanel preview={stubPreview({ open: true, qualityTier: 'low' })} onOpenDraw={vi.fn()} />);

    expect(screen.getByTestId('spectacle-preview__quality').textContent).toContain('LOW');
  });
});
