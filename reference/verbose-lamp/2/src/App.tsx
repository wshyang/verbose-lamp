import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  BookOpen,
  PenTool,
  Orbit,
  Film,
  Volume2,
  VolumeX,
  Eye,
  EyeOff,
} from 'lucide-react';

import {
  DEFAULT_HERO_TITLE,
  SEQUENCE_CHAPTERS,
  TOTAL_SEQUENCE_DURATION,
} from './data/gatsbyResearch';
import { CameraMode, HeroTitleConfig } from './types/sequence';
import { GatsbySceneManager } from './webgl/GatsbySceneManager';
import { CinemaAudioEngine } from './audio/cinemaAudio';
import { ResearchModal } from './components/ResearchModal';
import { CustomTitleModal } from './components/CustomTitleModal';
import { FrameStudioControl } from './components/FrameStudioControl';
import { useFrameStudio } from './lib/hooks/useFrameStudio';

function formatSeconds(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const managerRef = useRef<GatsbySceneManager | null>(null);
  const audioRef = useRef<CinemaAudioEngine | null>(null);
  const lastUiSyncRef = useRef<number>(0);

  const [currentTime, setCurrentTime] = useState(0);
  const [activeAct, setActiveAct] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [cameraMode, setCameraMode] = useState<CameraMode>('cinema');
  const [nitrateMode, setNitrateMode] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [hudHidden, setHudHidden] = useState(false);

  const [heroConfig, setHeroConfig] = useState<HeroTitleConfig>({
    ...DEFAULT_HERO_TITLE,
  });
  const [showResearch, setShowResearch] = useState(false);
  const [showCustomizer, setShowCustomizer] = useState(false);

  const getSceneManager = useCallback(() => managerRef.current, []);
  const frameStudio = useFrameStudio(getSceneManager);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const audio = new CinemaAudioEngine();
    audioRef.current = audio;

    const manager = new GatsbySceneManager(container, {
      onTelemetry: (t) => {
        const now = performance.now();
        // Throttle React HUD state updates to ~20fps so WebGL runs completely unencumbered
        if (now - lastUiSyncRef.current > 48) {
          lastUiSyncRef.current = now;
          setCurrentTime(t.currentTime);
          setIsPlaying(t.isPlaying);
        }
      },
      onChapterChange: (idx) => {
        setActiveAct(idx);
        audio.triggerActShimmer(idx);
      },
    });
    managerRef.current = manager;

    return () => {
      manager.dispose();
      audio.dispose();
      managerRef.current = null;
      audioRef.current = null;
    };
  }, []);

  // Keyboard shortcuts (Space = Play/Pause, 1-5 = Jump to Act, O = Orbit toggle, H = Hide HUD)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showResearch || showCustomizer) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (managerRef.current) {
          const next = managerRef.current.togglePlaying();
          setIsPlaying(next);
        }
      } else if (e.key >= '1' && e.key <= '5') {
        const idx = Number(e.key) - 1;
        managerRef.current?.jumpToChapter(idx);
        setActiveAct(idx);
      } else if (e.key.toLowerCase() === 'o') {
        const nextMode: CameraMode = cameraMode === 'cinema' ? 'orbit' : 'cinema';
        setCameraMode(nextMode);
        managerRef.current?.setCameraMode(nextMode);
      } else if (e.key.toLowerCase() === 'h') {
        setHudHidden((prev) => !prev);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cameraMode, showResearch, showCustomizer]);

  const handleTogglePlay = () => {
    if (!managerRef.current) return;
    const next = managerRef.current.togglePlaying();
    setIsPlaying(next);
  };

  const handleReplay = () => {
    if (!managerRef.current) return;
    if (cameraMode === 'orbit') {
      setCameraMode('cinema');
      managerRef.current.setCameraMode('cinema');
    }
    managerRef.current.setTime(0);
    managerRef.current.setPlaying(true);
    setCurrentTime(0);
    setIsPlaying(true);
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    managerRef.current?.setTime(val);
  };

  const handleJumpAct = (idx: number) => {
    setActiveAct(idx);
    managerRef.current?.jumpToChapter(idx);
    audioRef.current?.triggerActShimmer(idx);
  };

  const handleToggleCameraMode = () => {
    const next: CameraMode = cameraMode === 'cinema' ? 'orbit' : 'cinema';
    setCameraMode(next);
    managerRef.current?.setCameraMode(next);
  };

  const handleToggleNitrate = () => {
    const next = !nitrateMode;
    setNitrateMode(next);
    managerRef.current?.setNitrateMode(next);
  };

  const handleToggleSound = () => {
    if (!audioRef.current) return;
    const active = audioRef.current.toggle();
    setSoundOn(active);
  };

  const handleApplyHeroTitle = (cfg: HeroTitleConfig) => {
    setHeroConfig(cfg);
    if (managerRef.current) {
      managerRef.current.updateHeroTitle(cfg);
      // Jump straight to Act V (Hero Lockup) and play its golden frame draw-on!
      if (cameraMode === 'orbit') {
        setCameraMode('cinema');
        managerRef.current.setCameraMode('cinema');
      }
      managerRef.current.jumpToChapter(4);
      managerRef.current.setPlaying(true);
      setActiveAct(4);
      setIsPlaying(true);
    }
  };

  const currentChapter = SEQUENCE_CHAPTERS[activeAct] ?? SEQUENCE_CHAPTERS[0];

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#050407] select-none">
      {/* Full-Viewport WebGL Stage */}
      <div
        ref={mountRef}
        className={`absolute inset-0 w-full h-full ${
          cameraMode === 'orbit' ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
      />

      {/* Subtle Art Deco Hairline Proscenium Frame */}
      <div
        className={`pointer-events-none absolute inset-3 sm:inset-5 border border-[#d4af37]/20 transition-opacity duration-500 ${
          hudHidden ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <span className="absolute -top-[1px] -left-[1px] w-4 h-4 border-t-2 border-l-2 border-[#f8e29b]/60" />
        <span className="absolute -top-[1px] -right-[1px] w-4 h-4 border-t-2 border-r-2 border-[#f8e29b]/60" />
        <span className="absolute -bottom-[1px] -left-[1px] w-4 h-4 border-b-2 border-l-2 border-[#f8e29b]/60" />
        <span className="absolute -bottom-[1px] -right-[1px] w-4 h-4 border-b-2 border-r-2 border-[#f8e29b]/60" />
      </div>

      {/* Top Cinema Header */}
      <header
        className={`absolute top-0 left-0 right-0 z-20 flex flex-wrap items-center justify-between gap-3 px-6 sm:px-9 pt-6 sm:pt-8 transition-all duration-500 ${
          hudHidden ? 'opacity-0 -translate-y-3 pointer-events-none' : 'opacity-100 translate-y-0'
        }`}
      >
        {/* Brand Monogram & Pedigree */}
        <div className="flex items-center gap-3.5">
          <div className="w-9 h-9 rotate-45 border border-[#f8e29b]/65 bg-[#09070d]/80 flex items-center justify-center shadow-[0_0_20px_rgba(212,175,55,0.25)]">
            <span className="-rotate-45 text-xs font-deco font-bold tracking-tighter text-[#f8e29b]">
              GG
            </span>
          </div>
          <div>
            <div className="text-xs sm:text-sm font-deco tracking-[0.26em] text-[#fff4d4]">
              THE GREAT GATSBY
            </div>
            <div className="text-[10px] tracking-[0.22em] uppercase text-[#d4af37]/80">
              WebGL 3D Art Deco Title Sequence
            </div>
          </div>
        </div>

        {/* Studio Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowResearch(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] tracking-[0.18em] uppercase bg-[#0a080f]/80 hover:bg-[#191322] border border-[#d4af37]/40 hover:border-[#f8e29b] text-[#f5e7c6] transition-all cursor-pointer backdrop-blur-sm"
          >
            <BookOpen className="w-3.5 h-3.5 text-[#f8e29b]" />
            <span>Research</span>
          </button>

          <button
            onClick={() => setShowCustomizer(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] tracking-[0.18em] uppercase bg-[#0a080f]/80 hover:bg-[#191322] border border-[#d4af37]/40 hover:border-[#f8e29b] text-[#f5e7c6] transition-all cursor-pointer backdrop-blur-sm"
          >
            <PenTool className="w-3.5 h-3.5 text-[#f8e29b]" />
            <span className="hidden sm:inline">Customize Title</span>
            <span className="sm:hidden">Custom</span>
          </button>

          <button
            onClick={handleToggleCameraMode}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] tracking-[0.18em] uppercase border transition-all cursor-pointer backdrop-blur-sm ${
              cameraMode === 'orbit'
                ? 'bg-[#d4af37]/25 border-[#f8e29b] text-[#fff8e4] shadow-[0_0_18px_rgba(248,226,155,0.3)]'
                : 'bg-[#0a080f]/80 hover:bg-[#191322] border-[#d4af37]/40 hover:border-[#f8e29b] text-[#f5e7c6]'
            }`}
            title="Switch between Directed Z-Axis Fly-Through and Interactive 3D Orbit Inspection (O)"
          >
            <Orbit className="w-3.5 h-3.5 text-[#f8e29b]" />
            <span>{cameraMode === 'orbit' ? '3D Orbit: On' : '3D Orbit'}</span>
          </button>

          <button
            onClick={handleToggleNitrate}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] tracking-[0.18em] uppercase border transition-all cursor-pointer backdrop-blur-sm ${
              nitrateMode
                ? 'bg-[#e5e0d5]/20 border-[#fff4d4] text-[#ffffff]'
                : 'bg-[#0a080f]/80 hover:bg-[#191322] border-[#d4af37]/40 hover:border-[#f8e29b] text-[#f5e7c6]'
            }`}
            title="Toggle 1920s Silver-Nitrate Projector Emulsion Filter"
          >
            <Film className="w-3.5 h-3.5 text-[#f8e29b]" />
            <span className="hidden md:inline">1920s Nitrate</span>
          </button>

          <button
            onClick={handleToggleSound}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] tracking-[0.18em] uppercase border transition-all cursor-pointer backdrop-blur-sm ${
              soundOn
                ? 'bg-[#d4af37]/25 border-[#f8e29b] text-[#fff8e4]'
                : 'bg-[#0a080f]/80 hover:bg-[#191322] border-[#d4af37]/40 hover:border-[#f8e29b] text-[#f5e7c6]'
            }`}
            title="Toggle Procedural Orchestral & Golden Harp Ambience"
            aria-label="Toggle sound"
          >
            {soundOn ? (
              <Volume2 className="w-3.5 h-3.5 text-[#f8e29b]" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-[#d4af37]/75" />
            )}
          </button>
        </div>
      </header>

      {/* One control surface edits either the title-card rails or the outer poster border. */}
      <div
        className={`absolute right-6 sm:right-9 top-28 sm:top-[5.6rem] z-20 transition-all duration-500 ${
          hudHidden ? 'opacity-0 -translate-y-3 pointer-events-none' : 'opacity-100 translate-y-0'
        }`}
      >
        <FrameStudioControl
          surface={frameStudio.surface}
          sources={frameStudio.sources}
          activeSource={frameStudio.activeSource}
          level={frameStudio.level}
          detailPercent={frameStudio.detailPercent}
          detailPresets={frameStudio.detailPresets}
          activePreset={frameStudio.activePreset}
          isFixedPattern={frameStudio.isFixedPattern}
          posterEnabled={frameStudio.posterEnabled}
          onSurfaceChange={frameStudio.setSurface}
          onPatternChange={frameStudio.selectPattern}
          onLevelChange={frameStudio.setLevel}
          onDetailChange={frameStudio.setDetail}
          onPresetSelect={frameStudio.selectPreset}
          onPosterVisibilityChange={frameStudio.setPosterVisibility}
        />
      </div>

      {/* Minimal Floating Show/Hide HUD Toggle (always accessible) */}
      <button
        onClick={() => setHudHidden((prev) => !prev)}
        className="fixed bottom-6 right-6 z-30 p-2 bg-[#09070d]/75 border border-[#d4af37]/35 hover:border-[#f8e29b] text-[#d4af37] hover:text-[#fff4d4] transition-all cursor-pointer backdrop-blur-sm"
        title={hudHidden ? 'Show Cinema Controls (H)' : 'Hide Cinema Controls (H)'}
        aria-label="Toggle HUD visibility"
      >
        {hudHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
      </button>

      {/* Orbit Mode Interactive Hint */}
      {cameraMode === 'orbit' && !hudHidden && (
        <div className="pointer-events-none absolute top-22 left-1/2 -translate-x-1/2 z-20 px-4 py-1.5 bg-[#09070d]/85 border border-[#f8e29b]/45 text-[11px] tracking-[0.2em] uppercase text-[#fff4d4] backdrop-blur-sm shadow-[0_0_24px_rgba(212,175,55,0.2)]">
          Drag to Orbit 3D Gold Lattice · Scroll to Zoom · Click Any Act Below
        </div>
      )}

      {/* Bottom Theatrical Timeline & Chapter HUD */}
      <footer
        className={`absolute bottom-0 left-0 right-14 sm:right-16 z-20 px-6 sm:px-9 pb-6 sm:pb-8 transition-all duration-500 ${
          hudHidden ? 'opacity-0 translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'
        }`}
      >
        <div className="max-w-5xl mx-auto bg-[#08060c]/78 backdrop-blur-md border border-[#d4af37]/30 px-4 sm:px-6 py-3.5 shadow-[0_10px_50px_rgba(0,0,0,0.75)]">
          {/* Top Row: Active Chapter Info + 5-Act Quick Selectors */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 mb-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-deco tracking-[0.28em] uppercase px-2 py-0.5 bg-[#d4af37]/20 border border-[#d4af37]/45 text-[#f8e29b]">
                  ACT {currentChapter.actNumber}
                </span>
                <span className="text-xs sm:text-sm font-deco tracking-[0.16em] text-[#fff4d4] truncate">
                  {currentChapter.label.toUpperCase()}
                </span>
              </div>
              <p className="hidden sm:block mt-1 text-xs font-editorial text-[#e0cfa9]/75 truncate max-w-xl">
                {currentChapter.description}
              </p>
            </div>

            {/* 5-Act Chapter Jump Buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {SEQUENCE_CHAPTERS.map((ch, idx) => {
                const isActive = idx === activeAct;
                return (
                  <button
                    key={ch.id}
                    onClick={() => handleJumpAct(idx)}
                    className={`px-2.5 py-1 text-[10px] tracking-[0.18em] uppercase border transition-all whitespace-nowrap cursor-pointer ${
                      isActive
                        ? 'bg-[#d4af37]/25 border-[#f8e29b] text-[#fff6dc]'
                        : 'bg-[#0d0a13]/70 border-[#d4af37]/25 text-[#d4af37]/75 hover:border-[#d4af37]/65 hover:text-[#f5e7c6]'
                    }`}
                  >
                    {ch.actNumber}. {idx === 4 ? heroConfig.mainTitle || 'Gatsby' : ch.id}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bottom Row: Transport Controls + Diamond Scrubber */}
          <div className="flex items-center gap-3.5">
            <button
              onClick={handleTogglePlay}
              className="w-8 h-8 flex items-center justify-center border border-[#d4af37]/50 hover:border-[#f8e29b] bg-[#120e1a] text-[#f8e29b] hover:text-white transition-colors cursor-pointer shrink-0"
              aria-label={isPlaying ? 'Pause' : 'Play'}
              title="Play / Pause (Space)"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
            </button>

            <button
              onClick={handleReplay}
              className="w-8 h-8 flex items-center justify-center border border-[#d4af37]/35 hover:border-[#f8e29b] bg-[#120e1a] text-[#d4af37] hover:text-[#fff4d4] transition-colors cursor-pointer shrink-0"
              aria-label="Replay from beginning"
              title="Replay Sequence"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <div className="relative flex-1 flex items-center">
              <input
                type="range"
                min={0}
                max={TOTAL_SEQUENCE_DURATION}
                step={0.05}
                value={currentTime}
                onChange={handleScrub}
                className="w-full gatsby-range"
                aria-label="Sequence timeline"
              />
            </div>

            <div className="text-[11px] font-mono tracking-wider text-[#e6d5b2]/85 shrink-0 tabular-nums">
              {formatSeconds(currentTime)} <span className="text-[#d4af37]/50">/</span>{' '}
              {formatSeconds(TOTAL_SEQUENCE_DURATION)}
            </div>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <ResearchModal open={showResearch} onClose={() => setShowResearch(false)} />
      <CustomTitleModal
        open={showCustomizer}
        config={heroConfig}
        onApply={handleApplyHeroTitle}
        onClose={() => setShowCustomizer(false)}
      />
    </div>
  );
}

export default App;
