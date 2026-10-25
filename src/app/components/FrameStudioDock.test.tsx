// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { useFrameStudio } from '@/features/frame-studio';
import { FrameStudioDock } from './FrameStudioDock';

/**
 * The dock is the only thing the premiere mounts, so the studio's rendering
 * behaviour is asserted through it: reveal → panel → dismiss → reveal.
 */
function Harness() {
  const studio = useFrameStudio(() => null);
  return <FrameStudioDock studio={studio} hudHidden={false} />;
}

describe('FrameStudioDock', () => {
  it('opens on the title-card surface with the studio panel', () => {
    render(<Harness />);
    expect(screen.getByTestId('frame-studio__panel')).toBeDefined();
    expect(screen.getByTestId('frame-studio__surface-sequence').getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(screen.getByTestId('frame-studio__level')).toBeDefined();
  });

  it('swaps to the screen-border panel', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByTestId('frame-studio__surface-border'));
    expect(screen.getByTestId('frame-studio__surface-border').getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(screen.getByTestId('frame-studio__border-blurb')).toBeDefined();
    expect(screen.queryByTestId('frame-studio__level')).toBeNull();
  });

  it('switches the border on when its surface is chosen, and can switch it off', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByTestId('frame-studio__surface-border'));
    // Choosing the surface is the intent to see it, so the studio enables it.
    expect((screen.getByTestId('frame-studio__border-enable') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId('frame-studio__border-weight-readout').textContent).toContain('%');
    await user.click(screen.getByTestId('frame-studio__border-enable'));
    expect((screen.getByTestId('frame-studio__border-enable') as HTMLInputElement).checked).toBe(false);
  });

  it('applies a design preset', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const designs = screen.getAllByTestId('frame-studio__design');
    await user.click(designs[1]);
    expect(screen.getByTestId('frame-studio__design-label').textContent).not.toBe('');
  });

  it('adds a frame layer and reveals its level slider', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const toggles = screen.getAllByTestId('frame-studio__layer-toggle') as HTMLInputElement[];
    expect(toggles.every((toggle) => !toggle.checked)).toBe(true);
    const levelsBefore = screen.queryAllByTestId('frame-studio__layer-level').length;
    await user.click(toggles[0]);
    expect((screen.getAllByTestId('frame-studio__layer-toggle')[0] as HTMLInputElement).checked).toBe(
      true
    );
    expect(screen.queryAllByTestId('frame-studio__layer-level').length).toBe(levelsBefore + 1);
  });

  it('opens the proportion sliders', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByTestId('frame-studio__proportions-toggle'));
    expect(screen.queryByTestId('frame-studio__proportions')).not.toBeNull();
  });

  it('dismisses to a reveal button and comes back', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByTestId('frame-studio__dismiss'));
    expect(screen.queryByTestId('frame-studio__panel')).toBeNull();
    await user.click(screen.getByTestId('frame-studio__reveal'));
    expect(screen.queryByTestId('frame-studio__panel')).not.toBeNull();
  });

  it('resets every surface back to its default', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const before = screen.getByTestId('frame-studio__level').getAttribute('aria-valuenow');
    await user.click(screen.getByTestId('frame-studio__reset'));
    expect(screen.getByTestId('frame-studio__level').getAttribute('aria-valuenow')).toBe(before);
  });
});

// The panel is a 320 px column pinned to the right edge. On a phone it is most of the screen, and
// it is on top, so it covered the header, the timeline and every launcher: each button present,
// visible and unclickable. It now starts collapsed on a narrow screen and is one tap away.
describe('FrameStudioDock on a phone', () => {
  const setWidth = (width: number) =>
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });

  afterEach(() => setWidth(1024));

  it('starts collapsed below the desktop breakpoint, with the reveal chip showing', () => {
    setWidth(390);
    render(<Harness />);

    expect(screen.queryByTestId('frame-studio__panel')).toBeNull();
    expect(screen.getByTestId('frame-studio__reveal')).toBeDefined();
  });

  it('opens from the chip on a phone', async () => {
    setWidth(390);
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByTestId('frame-studio__reveal'));

    expect(screen.getByTestId('frame-studio__panel')).toBeDefined();
  });

  it('starts open at a desktop width', () => {
    setWidth(1440);
    render(<Harness />);

    expect(screen.getByTestId('frame-studio__panel')).toBeDefined();
  });

  // On a phone the header wraps to three rows, so a chip pinned at the desktop offset landed on
  // top of the QR and sparkler launchers. It sits below the header there and returns to the stage
  // edge from `sm` up.
  it('keeps the chip clear of the launchers on a phone and at the stage edge on larger screens', () => {
    setWidth(390);
    render(<Harness />);

    const classes = screen.getByTestId('frame-studio__reveal').className;
    expect(classes).toContain('top-60');
    expect(classes).toContain('sm:top-28');
  });
});
