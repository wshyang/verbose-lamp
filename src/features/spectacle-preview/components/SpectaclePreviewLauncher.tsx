import { Sparkles } from 'lucide-react';

interface LauncherProps {
  open: boolean;
  onToggle: () => void;
}

/** Header launcher, beside the other feature launchers. Self-evident label. */
export function SpectaclePreviewLauncher({ open, onToggle }: LauncherProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      data-testid="spectacle-preview__launch"
      aria-expanded={open}
      className={`flex items-center gap-2 border px-3 py-1.5 text-[11px] tracking-[0.2em] transition ${
        open
          ? 'border-[#f2d38a] bg-gradient-to-b from-[#a87c33] to-[#6e4d1c] text-[#fff3d0]'
          : 'border-[#8a6a2f]/60 text-[#d8b878] hover:border-[#d9b264] hover:bg-[#8a6a2f]/15'
      }`}
    >
      <Sparkles size={13} aria-hidden />
      SPECTACLE
    </button>
  );
}