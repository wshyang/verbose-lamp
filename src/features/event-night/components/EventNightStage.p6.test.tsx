// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EventNightStage } from './EventNightStage';
import { setupDomTests } from '@/test/dom';
import { type SpectaclePreview } from '@/features/spectacle-preview';

setupDomTests();
const stage = vi.hoisted(() => ({ play: vi.fn(), stopAll: vi.fn(), ready: true }));
const preview_p6 = vi.hoisted(() => ({ current: null as SpectaclePreview | null }));
const night = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
const controls = vi.hoisted(() => ({
  lattice: { latticeSeed: 1925, latticeDensity: 3, latticeLevel: 2 },
  gold: { navItems: [{ id: 'dinner', label: 'Dinner & Dance' }] },
  received: { gold: null as unknown, lattice: null as unknown },
}));
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
  useSpectaclePreview: () => preview_p6.current,
  SpectaclePreviewLauncher: ({ open, onToggle }: { open: boolean; onToggle: () => void }) => (
    <button type="button" data-open={String(open)} onClick={onToggle} data-testid="launcher" />
  ),
  // The real panel needs a live stage; the stage's job is only to mount it.
  SpectaclePreviewPanel: ({ preview: value, children }: { preview: SpectaclePreview; children?: React.ReactNode }) => (
    <span data-testid="panel" data-open={String(value.open)}>{children}</span>
  ),
}));
vi.mock('../hooks/useEventNight', () => ({ useEventNight: () => night.current }));
vi.mock('../hooks/useLatticeControls', () => ({ useLatticeControls: () => controls.lattice }));
vi.mock('../hooks/useGoldUiLines', () => ({ useGoldUiLines: () => controls.gold }));
vi.mock('./EventNightConsoleSections', () => ({
  GoldUiSection: ({ gold }: { gold: unknown }) => {
    controls.received.gold = gold;
    return <div data-testid="gold-section" />;
  },
  LatticeSection: ({ lattice }: { lattice: unknown }) => {
    controls.received.lattice = lattice;
    return <div data-testid="lattice-section" />;
  },
}));
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
    onStageClick: vi.fn(() => true),
    keepClearOn: false, speaker: { x: 0.4, y: 0.2, w: 0.2, h: 0.2 }, moveSpeaker: vi.fn(),
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
  preview_p6.current = buildPreview(previewOverrides);
  night.current = buildNight(nightOverrides);
  const onExit = vi.fn();
  const view = render(<EventNightStage onExit={onExit} />);
  return { preview: preview_p6.current, night: night.current as unknown as ReturnType<typeof buildNight>, onExit, view };
};
describe('EventNightStage', () => {
  // The two sections reach the console only through the panel's children slot; delete either and
  // nothing else would fail, because the panel double still renders whatever it is given.
  it('mounts the gold-nav and lattice sections inside the console, fed by the stage’s own controls', () => {
    mount();

    const panel = screen.getByTestId('panel');
    expect(panel.contains(screen.getByTestId('gold-section'))).toBe(true);
    expect(panel.contains(screen.getByTestId('lattice-section'))).toBe(true);
    expect(controls.received.gold).toBe(controls.gold);
    expect(controls.received.lattice).toBe(controls.lattice);
  });

  it('composes the backdrop, medallion, nav and header', () => {
    mount();

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
    expect(controls.gold.navItems).toHaveLength(1);
  });

  it('relays the exit, the draw and the launcher to their owners', () => {
    const { night: value, onExit } = mount();

    fireEvent.click(screen.getByTestId('event-night__back'));
    expect(onExit).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('event-night__open-draw'));
    expect(value.openDraw).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('launcher'));
    expect(preview_p6.current!.setOpen).toHaveBeenCalledWith(true);
  });

  it('reports pointer positions on the stage', () => {
    const { preview: value } = mount();

    fireEvent.click(screen.getByTestId('medallion'), { clientX: 120, clientY: 240 });

    expect(value.onStageClick).toHaveBeenCalledWith(120, 240);
  });

  it('starts the ambient show with fireworks and searchlights', () => {
    mount();

    expect(ambient.ready).toBe(true);
    expect(typeof ambient.start).toBe('function');
    ambient.start!();

    expect(preview_p6.current!.toggleFireworks).toHaveBeenCalledTimes(1);
    expect(preview_p6.current!.toggleSearchlights).toHaveBeenCalledTimes(1);
  });
});
