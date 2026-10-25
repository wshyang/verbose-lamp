import { useCallback, useEffect, useRef, useState } from 'react';
import { Dices, Mic2 } from 'lucide-react';
import { DecoLatticeFrame } from '@/features/deco-lattice';
import { GildedNavBar } from '@/features/gilded-ui';
import { LuckyDrawStage, type LuckyDrawEntry } from '@/features/lucky-draw';
import { MarqueeBorder, pointFromElement, useSpectacle } from '@/features/spectacle';
import {
  SECTION_TAGLINES, SpectaclePreviewLauncher, SpectaclePreviewPanel, useSpectaclePreview,
} from '@/features/spectacle-preview';

/** Composes the event-night host: one provider, one layer, feature surfaces. */
export function EventNight() {
  const preview = useSpectaclePreview();
  const { play } = useSpectacle();
  const [drawOpen, setDrawOpen] = useState(false);
  const [activeNav, setActiveNav] = useState('');
  const [tagline, setTagline] = useState(SECTION_TAGLINES.foyer);
  const startedRef = useRef(false);
  const navRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    // Child effects run before the provider creates the stage; start the
    // ambient show one tick later so play() reaches a live stage.
    window.setTimeout(() => {
      preview.toggleFireworks();
      preview.toggleSearchlights();
    }, 450);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLanded = useCallback(
    (winner: LuckyDrawEntry) => {
      play('confetti', { mode: 'burst', origin: { x: 0.5, y: 0.4 }, seed: Date.now() % 100000 });
      play('name-reveal', { name: winner.name, subtitle: winner.subtitle ?? 'Lucky draw winner' });
    },
    [play],
  );

  const handleSelect = useCallback(
    (id: string) => {
      const item = preview.navItems.find((i) => i.id === id);
      if (!item) return;
      setActiveNav(id);
      const key = item.label.toLowerCase();
      if (key.includes('draw')) {
        setDrawOpen(true);
        return;
      }
      const from = navRef.current ? pointFromElement(navRef.current) : { x: 0.5, y: 0.95 };
      play('orb-transition', {
        origin: { x: from.x, y: Math.min(from.y, 0.96) },
        pattern: 'sides',
        direction: 'outward',
        durationMs: 1300,
        onCovered: () => {
          setTagline(SECTION_TAGLINES[key] ?? 'AN EVENING AT WEST EGG');
          if (key.includes('toast')) play('confetti', { mode: 'rain', durationMs: 2600 });
        },
      });
    },
    [preview.navItems, play],
  );

  const resolvedActive = preview.navItems.some((i) => i.id === activeNav)
    ? activeNav
    : preview.navItems[0]?.id ?? '';

  return (
    <>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 90% 65% at 50% 38%, #1c1206 0%, #0d0803 55%, #050302 100%)',
        }}
        aria-hidden="true"
      />
      <div className="relative z-10 flex min-h-screen flex-col" onClick={(e) => preview.onStageClick(e.clientX, e.clientY)}>
        <header className="relative z-30 flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 rotate-45 items-center justify-center border border-[#c9a44e]/70 bg-[#171006]">
              <span className="-rotate-45 font-display text-[11px] text-[#f2d38a]">GG</span>
            </span>
            <div className="leading-tight">
              <p className="font-body text-[11px] tracking-[0.3em] text-[#e9c877]">WEST EGG GRAND BALLROOM</p>
              <p className="font-body text-[9px] tracking-[0.3em] text-[#9a7c48]">SATURDAY · OCTOBER 24 · 2026</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawOpen(true)}
              data-testid="event-night__open-draw"
              className="flex items-center gap-2 border border-[#8a6a2f]/60 px-3 py-1.5 text-[11px] tracking-[0.2em] text-[#d8b878] transition hover:border-[#d9b264] hover:bg-[#8a6a2f]/15"
            >
              <Dices size={13} aria-hidden /> LUCKY DRAW
            </button>
            <SpectaclePreviewLauncher open={preview.open} onToggle={() => preview.setOpen(!preview.open)} />
          </div>
        </header>

        <main className="relative flex flex-1 items-center justify-center px-4 pb-28 pt-2">
          <div className="relative w-[min(82vmin,640px)]">
            <DecoLatticeFrame
              request={{
                mode: 'medallion',
                seed: preview.latticeSeed,
                density: preview.latticeDensity,
                level: preview.latticeLevel,
              }}
              className="aspect-square w-full"
            >
              {preview.marqueeOn && <MarqueeBorder mode="chase" bulbCount={64} />}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-[18%] text-center sm:gap-3">
                <p className="font-body text-[9px] tracking-[0.5em] text-[#b3925a] sm:text-[11px]">ONE NIGHT ONLY</p>
                <h1 className="gilded-title font-display text-4xl leading-[1.08] text-[#f2d38a] sm:text-5xl md:text-6xl">
                  THE<br />GREAT<br />GATSBY
                </h1>
                <div className="flex w-full items-center gap-2" aria-hidden="true">
                  <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#c9a44e]" />
                  <span className="h-1.5 w-1.5 rotate-45 bg-[#e9c877]" />
                  <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#c9a44e]" />
                </div>
                <p className="font-body text-xs tracking-[0.45em] text-[#e9c877] sm:text-base">DINNER &amp; DANCE</p>
                <p className="min-h-4 font-body text-[8px] tracking-[0.28em] text-[#9a7c48] sm:text-[10px]" data-testid="event-night__tagline">
                  {tagline}
                </p>
              </div>
            </DecoLatticeFrame>
          </div>
        </main>

        <div ref={navRef} className="fixed inset-x-0 bottom-3 z-30 flex justify-center px-2">
          <GildedNavBar items={preview.navItems} activeId={resolvedActive} onSelect={handleSelect} />
        </div>
      </div>

      {preview.open && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${preview.origin.x * 100}%`, top: `${preview.origin.y * 100}%` }}
          data-testid="spectacle-preview__crosshair"
          aria-hidden="true"
        >
          <div className={`h-8 w-8 rounded-full border ${preview.picking ? 'animate-pulse border-[#fff3d0]' : 'border-[#d9b264]/80'}`}>
            <span className="absolute left-1/2 top-1/2 h-px w-10 -translate-x-1/2 bg-[#d9b264]/60" />
            <span className="absolute left-1/2 top-1/2 h-10 w-px -translate-y-1/2 bg-[#d9b264]/60" />
          </div>
          <p className="mt-1 text-center text-[8px] tracking-[0.3em] text-[#d9b264]">ORIGIN</p>
        </div>
      )}

      {preview.picking && (
        <p className="pointer-events-none absolute inset-x-0 top-16 z-20 text-center text-[10px] tracking-[0.35em] text-[#f2d38a]">
          CLICK ANYWHERE ON THE STAGE TO SET THE ORIGIN
        </p>
      )}

      {preview.keepClearOn && (
        <div
          role="img"
          aria-label="Keep-clear demo speaker box. Drag to move; fireworks avoid it."
          data-testid="spectacle-preview__speaker"
          className="absolute z-20 flex cursor-move touch-none flex-col items-center justify-center gap-1 border-2 border-dashed border-[#d9b264]/70 bg-[#171006]/40 text-[#d9b264]"
          style={{
            left: `${preview.speaker.x * 100}%`,
            top: `${preview.speaker.y * 100}%`,
            width: `${preview.speaker.w * 100}%`,
            height: `${preview.speaker.h * 100}%`,
          }}
          onPointerDown={(e) => {
            draggingRef.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (draggingRef.current) preview.moveSpeaker(e.movementX / window.innerWidth, e.movementY / window.innerHeight);
          }}
          onPointerUp={() => {
            draggingRef.current = false;
          }}
        >
          <Mic2 size={18} aria-hidden />
          <span className="text-[8px] tracking-[0.3em]">KEEP CLEAR</span>
        </div>
      )}

      <SpectaclePreviewPanel preview={preview} onOpenDraw={() => setDrawOpen(true)} />
      {drawOpen && <LuckyDrawStage onClose={() => setDrawOpen(false)} onLanded={handleLanded} />}
    </>
  );
}