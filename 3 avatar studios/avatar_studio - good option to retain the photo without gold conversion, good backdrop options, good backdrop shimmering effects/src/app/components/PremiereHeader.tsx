import {
  BookOpen,
  Film,
  Orbit,
  PenTool,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { AvatarStudioLauncher, WeiLingAvatarButton } from '@/features/avatar-studio';
import { QrGeneratorLauncher } from '@/features/qr-generator';
import type { CameraMode } from '@/features/premiere';
import { Button, IconButton } from '@/shared/ui';
import { cn } from '@/shared/lib/cn';

interface PremiereHeaderProps {
  cameraMode: CameraMode;
  nitrateMode: boolean;
  soundOn: boolean;
  hudHidden: boolean;
  onOpenResearch: () => void;
  onOpenCustomizer: () => void;
  onToggleCameraMode: () => void;
  onToggleNitrate: () => void;
  onToggleSound: () => void;
}

export function PremiereHeader({
  cameraMode,
  nitrateMode,
  soundOn,
  hudHidden,
  onOpenResearch,
  onOpenCustomizer,
  onToggleCameraMode,
  onToggleNitrate,
  onToggleSound,
}: PremiereHeaderProps) {
  return (
    <header className={cn(
      'absolute left-0 right-0 top-0 z-20 flex flex-wrap items-center justify-between gap-3 px-6 pt-6 transition-all duration-500 sm:px-9 sm:pt-8',
      hudHidden ? 'pointer-events-none -translate-y-3 opacity-0' : 'translate-y-0 opacity-100'
    )}>
      <div className="flex items-center gap-3.5">
        <div className="flex h-9 w-9 rotate-45 items-center justify-center border border-[#f8e29b]/65 bg-[#09070d]/80 shadow-[0_0_20px_rgba(212,175,55,0.25)]">
          <span className="-rotate-45 font-deco text-xs font-bold tracking-tighter text-[#f8e29b]">GG</span>
        </div>
        <div>
          <div className="font-deco text-xs tracking-[0.26em] text-[#fff4d4] sm:text-sm">THE GREAT GATSBY</div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-[#d4af37]/80">WebGL 3D Art Deco Title Sequence</div>
        </div>
      </div>

      <nav className="flex flex-wrap items-center gap-2" aria-label="Premiere tools">
        <Button onClick={onOpenResearch} data-testid="premiere-header__research">
          <BookOpen className="h-3.5 w-3.5 text-[#f8e29b]" />
          <span>Research</span>
        </Button>
        <Button onClick={onOpenCustomizer} data-testid="premiere-header__customize">
          <PenTool className="h-3.5 w-3.5 text-[#f8e29b]" />
          <span className="hidden sm:inline">Customize Title</span>
          <span className="sm:hidden">Custom</span>
        </Button>
        <QrGeneratorLauncher />
        <AvatarStudioLauncher />
        <WeiLingAvatarButton />
        <Button
          onClick={onToggleCameraMode}
          variant={cameraMode === 'orbit' ? 'selected' : 'panel'}
          aria-pressed={cameraMode === 'orbit'}
          title="Switch between Directed Fly-Through and Interactive 3D Orbit (O)"
          data-testid="premiere-header__orbit"
        >
          <Orbit className="h-3.5 w-3.5 text-[#f8e29b]" />
          <span>{cameraMode === 'orbit' ? '3D Orbit: On' : '3D Orbit'}</span>
        </Button>
        <Button
          onClick={onToggleNitrate}
          variant={nitrateMode ? 'selected' : 'panel'}
          aria-pressed={nitrateMode}
          title="Toggle the 1920s silver-nitrate look"
          data-testid="premiere-header__nitrate"
        >
          <Film className="h-3.5 w-3.5 text-[#f8e29b]" />
          <span className="hidden md:inline">1920s Nitrate</span>
        </Button>
        <IconButton
          onClick={onToggleSound}
          label={soundOn ? 'Mute sound' : 'Enable sound'}
          title="Toggle procedural orchestral ambience"
          variant={soundOn ? 'selected' : 'panel'}
          icon={soundOn ? <Volume2 className="h-3.5 w-3.5 text-[#f8e29b]" /> : <VolumeX className="h-3.5 w-3.5 text-[#d4af37]/75" />}
          data-testid="premiere-header__sound"
        />
      </nav>
    </header>
  );
}