import { Pause, Play, RotateCcw } from 'lucide-react';
import type { HeroTitleConfig, SequenceChapter } from '@/features/premiere';
import { formatSeconds } from '@/shared/lib/formatTime';
import { Button, IconButton, RangeInput } from '@/shared/ui';
import { cn } from '@/shared/lib/cn';

interface PremiereTimelineProps {
  chapters: readonly SequenceChapter[];
  currentChapter: SequenceChapter;
  heroConfig: HeroTitleConfig;
  activeAct: number;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  hudHidden: boolean;
  onSelectAct: (index: number) => void;
  onTogglePlayback: () => void;
  onReplay: () => void;
  onScrub: (time: number) => void;
}

export function PremiereTimeline({
  chapters,
  currentChapter,
  heroConfig,
  activeAct,
  currentTime,
  duration,
  isPlaying,
  hudHidden,
  onSelectAct,
  onTogglePlayback,
  onReplay,
  onScrub,
}: PremiereTimelineProps) {
  return (
    <footer className={cn(
      'absolute bottom-0 left-0 right-14 z-20 px-6 pb-6 transition-all duration-500 sm:right-16 sm:px-9 sm:pb-8',
      hudHidden ? 'pointer-events-none translate-y-4 opacity-0' : 'translate-y-0 opacity-100'
    )}>
      <div className="mx-auto max-w-5xl border border-[#d4af37]/30 bg-[#08060c]/78 px-4 py-3.5 shadow-[0_10px_50px_rgba(0,0,0,0.75)] backdrop-blur-md sm:px-6">
        <div className="mb-3 flex flex-col justify-between gap-2.5 lg:flex-row lg:items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="border border-[#d4af37]/45 bg-[#d4af37]/20 px-2 py-0.5 font-deco text-[10px] uppercase tracking-[0.28em] text-[#f8e29b]">
                ACT {currentChapter.actNumber}
              </span>
              <span className="truncate font-deco text-xs tracking-[0.16em] text-[#fff4d4] sm:text-sm">
                {currentChapter.label.toUpperCase()}
              </span>
            </div>
            <p className="mt-1 hidden max-w-xl truncate font-editorial text-xs text-[#e0cfa9]/75 sm:block">
              {currentChapter.description}
            </p>
          </div>

          <nav className="flex items-center gap-1.5 overflow-x-auto pb-0.5" aria-label="Sequence chapters">
            {chapters.map((chapter, index) => (
              <Button
                key={chapter.id}
                onClick={() => onSelectAct(index)}
                variant={index === activeAct ? 'selected' : 'panel'}
                size="small"
                className="whitespace-nowrap tracking-[0.18em]"
                data-testid="timeline__chapter"
              >
                {chapter.actNumber}. {index === 4 ? heroConfig.mainTitle || 'Gatsby' : chapter.id}
              </Button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3.5">
          <IconButton
            onClick={onTogglePlayback}
            label={isPlaying ? 'Pause sequence' : 'Play sequence'}
            title="Play / Pause (Space)"
            icon={isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
            className="shrink-0 border-[#d4af37]/50 bg-[#120e1a] text-[#f8e29b] hover:text-white"
            data-testid="timeline__play-toggle"
          />
          <IconButton
            onClick={onReplay}
            label="Replay from beginning"
            title="Replay Sequence"
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            className="shrink-0 border-[#d4af37]/35 bg-[#120e1a] text-[#d4af37] hover:text-[#fff4d4]"
            data-testid="timeline__replay"
          />
          <RangeInput
            min={0}
            max={duration}
            step={0.05}
            value={currentTime}
            onChange={(event) => onScrub(Number(event.target.value))}
            aria-label="Sequence timeline"
            data-testid="timeline__scrubber"
          />
          <div className="shrink-0 font-mono text-[11px] tabular-nums tracking-wider text-[#e6d5b2]/85">
            {formatSeconds(currentTime)} <span className="text-[#d4af37]/50">/</span> {formatSeconds(duration)}
          </div>
        </div>
      </div>
    </footer>
  );
}