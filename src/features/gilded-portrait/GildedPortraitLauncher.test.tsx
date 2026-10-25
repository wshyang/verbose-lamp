// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GildedPortraitLauncher } from './GildedPortraitLauncher';
import { GildedPortraitCanvas } from './GildedPortraitCanvas';
import { buildStudioPortraitFixture } from './fixtures';

describe('GildedPortraitLauncher', () => {
  it('opens the studio from its button and closes it again', async () => {
    render(<GildedPortraitLauncher className="custom-class" />);
    const launcher = screen.getByTestId('gilded-portrait__launch');
    expect(launcher.className).toContain('custom-class');
    expect(launcher.getAttribute('aria-haspopup')).toBe('dialog');
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.click(launcher);
    expect(screen.getByRole('dialog')).toBeDefined();

    await userEvent.click(screen.getByTestId('gilded-portrait__close'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

const portrait = buildStudioPortraitFixture();

describe('GildedPortraitCanvas', () => {
  it('paints the raster into a canvas and shows the sheen by default', () => {
    render(<GildedPortraitCanvas image={portrait} label="Gilded preview" isShimmering />);
    const canvas = screen.getByTestId('gilded-portrait__preview') as HTMLCanvasElement;
    expect(canvas.width).toBe(portrait.width);
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.getAttribute('aria-label')).toBe('Gilded preview');
    expect(document.querySelector('.gilded-portrait-sheen')).not.toBeNull();
  });

  it('skips painting when the canvas has no 2D context', () => {
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValueOnce(null);
    try {
      render(<GildedPortraitCanvas image={portrait} label="No context" isShimmering={false} />);
      const canvas = screen.getByTestId('gilded-portrait__preview') as HTMLCanvasElement;
      expect(canvas.width).toBe(300);
      expect(canvas.getAttribute('aria-label')).toBe('No context');
    } finally {
      spy.mockRestore();
    }
  });

  it('honours a host test id and hides the sheen on request', () => {
    render(
      <GildedPortraitCanvas
        image={portrait}
        label="Borrowed preview"
        isShimmering={false}
        testId="other-feature__preview"
      />,
    );
    expect(screen.getByTestId('other-feature__preview')).toBeDefined();
    expect(document.querySelector('.gilded-portrait-sheen')).toBeNull();
  });
});
