// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventNightStage } from './EventNightStage';
import { EventNightScreen } from '../EventNightScreen';
import { EventNightHeader } from './EventNightHeader';

const preview = vi.hoisted(() => ({
  value: {
    navItems: [
      { id: 'nav-0-foyer', emoji: '🥂', label: 'Foyer' },
      { id: 'nav-1-program', emoji: '🎷', label: 'Program' },
      { id: 'nav-2-toast', emoji: '🥂', label: 'Toast' },
    ],
    open: false,
    setOpen: vi.fn(),
    origin: { x: 0.5, y: 0.5 },
    picking: false,
    keepClearOn: false,
    speaker: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    moveSpeaker: vi.fn(),
    onStageClick: vi.fn(),
    latticeSeed: 1925,
    latticeDensity: 0.6,
    latticeLevel: 3,
    marqueeOn: true,
    toggleFireworks: vi.fn(),
    toggleSearchlights: vi.fn(),
  },
}));

vi.mock('@/features/spectacle', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/spectacle')>();
  return {
    ...actual,
    SpectacleProvider: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="spectacle__provider">{children}</div>
    ),
    useSpectacle: () => ({ isReady: true, play: vi.fn(() => ({ finished: Promise.resolve(), stop: vi.fn() })) }),
  };
});

vi.mock('@/features/spectacle-preview', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/spectacle-preview')>();
  return {
    ...actual,
    useSpectaclePreview: () => preview.value,
    SpectaclePreviewLauncher: ({ open, onToggle }: { open: boolean; onToggle: () => void }) => (
      <button type="button" data-testid="preview__launcher" aria-pressed={open} onClick={onToggle}>
        spectacle
      </button>
    ),
    SpectaclePreviewPanel: ({ preview: state }: { preview: { open: boolean } }) =>
      state.open ? <div data-testid="preview__panel" /> : null,
  };
});

vi.mock('@/features/lucky-draw', () => ({
  LuckyDrawStage: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="lucky-draw__stage">
      <button type="button" data-testid="lucky-draw__close" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

vi.mock('@/features/gilded-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/gilded-ui')>();
  return {
    ...actual,
    GildedGlyphDefs: () => <svg data-testid="gilded__defs" />,
    GildedNavBar: ({ items, onSelect }: { items: readonly { id: string; label: string }[]; onSelect: (id: string) => void }) => (
    <nav data-testid="gilded__nav">
      {items.map((item) => (
        <button key={item.id} type="button" onClick={() => onSelect(item.id)}>
          {item.label}
        </button>
        ))}
      </nav>
    ),
  };
});

vi.mock('../hooks/useAmbientShow', () => ({ useAmbientShow: vi.fn() }));

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('EventNightStage', () => {
  it('composes the medallion, the nav bar and the empty overlays', () => {
    render(<EventNightStage onExit={vi.fn()} />);
    expect(document.body.textContent).toContain('GATSBY');
    expect(screen.getByTestId('event-night__tagline').textContent).toContain('CHAMPAGNE');
    expect(screen.getByTestId('gilded__nav')).toBeDefined();
    expect(screen.queryByTestId('event-night__origin-crosshair')).toBeNull();
    expect(screen.queryByTestId('event-night__pick-hint')).toBeNull();
    expect(screen.queryByTestId('event-night__speaker')).toBeNull();
    expect(screen.queryByTestId('lucky-draw__stage')).toBeNull();
  });

  it('starts the ambient fireworks and searchlights when the stage is ready', async () => {
    const { useAmbientShow } = await import('../hooks/useAmbientShow');
    render(<EventNightStage onExit={vi.fn()} />);
    expect(useAmbientShow).toHaveBeenCalledWith(
      expect.objectContaining({ isReady: true, start: expect.any(Function) }),
    );
    const start = (useAmbientShow as unknown as { mock: { calls: Array<[{ start: () => void }]> } }).mock.calls[0][0]
      .start;
    start();
    expect(preview.value.toggleFireworks).toHaveBeenCalledTimes(1);
    expect(preview.value.toggleSearchlights).toHaveBeenCalledTimes(1);
  });

  it('shows the picking hint, the crosshair and the speaker box when enabled', () => {
    preview.value.open = true;
    preview.value.picking = true;
    preview.value.keepClearOn = true;
    render(<EventNightStage onExit={vi.fn()} />);
    expect(screen.getByTestId('event-night__origin-crosshair')).toBeDefined();
    expect(screen.getByTestId('event-night__pick-hint')).toBeDefined();
    expect(screen.getByTestId('event-night__speaker')).toBeDefined();
    expect(screen.getByTestId('preview__panel')).toBeDefined();
    preview.value.open = false;
    preview.value.picking = false;
    preview.value.keepClearOn = false;
  });

  it('reports stage clicks and opens the draw from the header and the panel', async () => {
    render(<EventNightStage onExit={vi.fn()} />);
    const stage = screen.getByTestId('event-night__tagline').closest('div[class*="z-10"]') as HTMLElement;
    fireEvent.click(stage, { clientX: 120, clientY: 80 });
    expect(preview.value.onStageClick).toHaveBeenCalledWith(120, 80);

    await userEvent.click(screen.getByTestId('event-night__open-draw'));
    expect(await screen.findByTestId('lucky-draw__stage')).toBeDefined();
    await userEvent.click(screen.getByTestId('lucky-draw__close'));
    expect(screen.queryByTestId('lucky-draw__stage')).toBeNull();
  });

  it('toggles the preview panel and leaves the screen', async () => {
    const onExit = vi.fn();
    render(<EventNightStage onExit={onExit} />);
    await userEvent.click(screen.getByTestId('preview__launcher'));
    expect(preview.value.setOpen).toHaveBeenCalledWith(true);
    await userEvent.click(screen.getByTestId('event-night__back'));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('changes the tagline when a section is chosen', async () => {
    render(<EventNightStage onExit={vi.fn()} />);
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Program' }));
    });
    expect(screen.getByRole('button', { name: 'Program' })).toBeDefined();
  });
});

describe('EventNightHeader', () => {
  it('renders the brand, both actions and the supplied launcher', async () => {
    const onExit = vi.fn();
    const onOpenDraw = vi.fn();
    render(
      <EventNightHeader onExit={onExit} onOpenDraw={onOpenDraw} launcher={<span data-testid="host-launcher" />} />,
    );
    expect(screen.getByText('WEST EGG GRAND BALLROOM')).toBeDefined();
    expect(screen.getByTestId('host-launcher')).toBeDefined();
    await userEvent.click(screen.getByTestId('event-night__back'));
    expect(onExit).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByTestId('event-night__open-draw'));
    expect(onOpenDraw).toHaveBeenCalledTimes(1);
  });
});

describe('EventNightScreen', () => {
  it('mounts its own spectacle stage and glyph definitions', () => {
    render(<EventNightScreen onExit={vi.fn()} />);
    expect(screen.getByTestId('event-night__screen')).toBeDefined();
    expect(screen.getByTestId('spectacle__provider')).toBeDefined();
    expect(screen.getByTestId('gilded__defs')).toBeDefined();
  });
});
