// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { setupDomTests } from '@/test/dom';
import type { SpectaclePreview } from '@/features/spectacle-preview';
import { EventNightStage } from './EventNightStage';

setupDomTests();

const stage = vi.hoisted(() => ({ play: vi.fn(), stopAll: vi.fn(), ready: true }));
const preview = vi.hoisted(() => ({ current: null as SpectaclePreview | null }));
const night = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
const ambient = vi.hoisted(() => ({ start: null as (() => void) | null, ready: false }));

vi.mock('@/features/spectacle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/spectacle')>()),
  useSpectacle: () => ({
    play: stage.play, stopAll: stage.stopAll, qualityTier: 'low', isReady: stage.ready,
    reducedMotion: false, simulatedReducedMotion: false, setSimulatedReducedMotion: vi.fn(),
  }),
}));

vi.mock('@/features/spectacle-preview', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/spectacle-preview')>()),
  useSpectaclePreview: () => preview.current,
  SpectaclePreviewLauncher: ({ open, onToggle }: { open: boolean; onToggle: () => void }) => (
    <button type="button" data-open={String(open)} onClick={onToggle} data-testid="launcher" />
  ),
  // The real panel needs a live stage; the stage's job is only to mount it.
  SpectaclePreviewPanel: ({ preview: value }: { preview: SpectaclePreview }) => (
    <span data-testid="panel" data-open={String(value.open)} />
  ),
}));

vi.mock('../hooks/useEventNight', () => ({ useEventNight: () => night.current }));
vi.mock('../hooks/useAmbientShow', () => ({
  useAmbientShow: ({ isReady, start }: { isReady: boolean; start: () => void }) => {
    ambient.start = start;
    ambient.ready = isReady;
  },
}));
vi.mock('@/features/lucky-draw', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/lucky-draw')>()),
  LuckyDrawStage: ({ onClose }: { onClose: () => void }) => (
    <button type="button" data-testid="lucky-draw__stage" onClick={onClose} />
  ),
}));
vi.mock('./StageBackdrop', () => ({ StageBackdrop: () => <div data-testid="backdrop" /> }));
vi.mock('./TitleMedallion', () => ({
  TitleMedallion: ({ tagline, hasMarquee, lattice }: { tagline: string; hasMarquee: boolean; lattice: unknown }) => (
    <div data-testid="medallion" data-tagline={tagline} data-marquee={String(hasMarquee)}
      data-lattice={JSON.stringify(lattice)} />
  ),
}));

const buildPreview = (overrides: Record<string, unknown> = {}) =>
  ({
    open: false, setOpen: vi.fn(), marqueeOn: true,
    picking: false, origin: { x: 0.5, y: 0.42 }, setPicking: vi.fn(),
    navItems: [{ id: 'dinner', label: 'Dinner & Dance' }],
    onStageClick: vi.fn(() => true),
    keepClearOn: false, speaker: { x: 0.4, y: 0.2, w: 0.2, h: 0.2 }, moveSpeaker: vi.fn(),
    latticeSeed: 1925, latticeDensity: 3, latticeLevel: 2,
    toggleFireworks: vi.fn(), toggleSearchlights: vi.fn(),
    ...overrides,
  }) as unknown as SpectaclePreview;

const buildNight = (overrides: Record<string, unknown> = {}) => ({
  tagline: 'Dinner is served',
  activeId: 'dinner',
  navRef: { current: null },
  selectNav: vi.fn(),
  openDraw: vi.fn(),
  closeDraw: vi.fn(),
  isDrawOpen: false,
  handleLanded: vi.fn(),
  ...overrides,
});

const mount = (previewOverrides: Record<string, unknown> = {}, nightOverrides: Record<string, unknown> = {}) => {
  preview.current = buildPreview(previewOverrides);
  night.current = buildNight(nightOverrides);
  const onExit = vi.fn();
  const view = render(<EventNightStage onExit={onExit} />);
  return { preview: preview.current, night: night.current as unknown as ReturnType<typeof buildNight>, onExit, view };
};

describe('EventNightStage', () => {
  it('composes the backdrop, medallion, nav and header', () => {
    const { preview: value } = mount();

    expect(screen.getByTestId('backdrop')).toBeTruthy();
    const medallion = screen.getByTestId('medallion');
    expect(medallion.getAttribute('data-tagline')).toBe('Dinner is served');
    expect(medallion.getAttribute('data-marquee')).toBe('true');
    expect(JSON.parse(medallion.getAttribute('data-lattice')!)).toEqual({
      seed: 1925, density: 3, level: 2,
    });
    expect(screen.getByTestId('event-night__back')).toBeTruthy();
    expect(screen.getByTestId('event-night__open-draw')).toBeTruthy();
    expect(screen.getByTestId('launcher').getAttribute('data-open')).toBe('false');
    expect(value.navItems).toHaveLength(1);
  });

  it('relays the exit, the draw and the launcher to their owners', () => {
    const { night: value, onExit } = mount();

    fireEvent.click(screen.getByTestId('event-night__back'));
    expect(onExit).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('event-night__open-draw'));
    expect(value.openDraw).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('launcher'));
    expect(preview.current!.setOpen).toHaveBeenCalledWith(true);
  });

  it('reports pointer positions on the stage', () => {
    const { preview: value } = mount();

    fireEvent.click(screen.getByTestId('medallion'), { clientX: 120, clientY: 240 });

    expect(value.onStageClick).toHaveBeenCalledWith(120, 240);
  });

  it('shows the crosshair only while the console is open', () => {
    const closed = mount();
    expect(screen.queryByTestId('event-night__origin-crosshair')).toBeNull();
    closed.view.unmount();

    mount({ open: true });
    expect(screen.getByTestId('event-night__origin-crosshair')).toBeTruthy();
  });

  it('prompts for an origin while picking and shows the keep-clear box', () => {
    const picking = mount({ picking: true });
    expect(screen.getByTestId('event-night__pick-hint')).toBeTruthy();
    picking.view.unmount();

    mount({ keepClearOn: true });
    expect(screen.getByTestId('event-night__speaker')).toBeTruthy();
  });

  it('mounts the lucky draw only while it is open', () => {
    const shut = mount();
    expect(screen.queryByTestId('lucky-draw__stage')).toBeNull();
    shut.view.unmount();

    mount({}, { isDrawOpen: true });
    expect(screen.getByTestId('lucky-draw__stage')).toBeTruthy();
  });

  it('starts the ambient show with fireworks and searchlights', () => {
    mount();

    expect(ambient.ready).toBe(true);
    expect(typeof ambient.start).toBe('function');
    ambient.start!();

    expect(preview.current!.toggleFireworks).toHaveBeenCalledTimes(1);
    expect(preview.current!.toggleSearchlights).toHaveBeenCalledTimes(1);
  });
});
