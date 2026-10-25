// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { setupDomTests } from '@/test/dom';
import { EventNightScreen } from './EventNightScreen';

setupDomTests();

// The stage owns a three.js canvas and its own suite; here we only prove the screen
// composes what the room needs: glyph defs, the spectacle provider, and the stage.
vi.mock('./components/EventNightStage', () => ({
  EventNightStage: ({ onExit }: { onExit: () => void }) => (
    <button type="button" data-testid="stage" onClick={onExit} />
  ),
}));

describe('EventNightScreen', () => {
  it('mounts the glyph defs and the stage inside the spectacle provider', () => {
    const { container } = render(<EventNightScreen onExit={vi.fn()} />);

    const root = screen.getByTestId('event-night__screen');
    expect(root.className).toContain('h-dvh');
    // `GildedGlyphDefs` is the shared gradient/filter sheet every plaque pulls from.
    expect(container.querySelector('#gilded-plaque')).toBeTruthy();
    expect(screen.getByTestId('stage')).toBeTruthy();
  });

  it('relays the stage exit to the host', () => {
    const onExit = vi.fn();
    render(<EventNightScreen onExit={onExit} />);

    fireEvent.click(screen.getByTestId('stage'));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
