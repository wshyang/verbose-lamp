import { Eye, EyeOff } from 'lucide-react';
import { IconButton } from '@/shared/ui';

interface FloatingHudToggleProps {
  isHidden: boolean;
  onToggle: () => void;
}

export function FloatingHudToggle({ isHidden, onToggle }: FloatingHudToggleProps) {
  return (
    <IconButton
      onClick={onToggle}
      label={isHidden ? 'Show cinema controls' : 'Hide cinema controls'}
      title={isHidden ? 'Show Cinema Controls (H)' : 'Hide Cinema Controls (H)'}
      icon={isHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      className="fixed bottom-6 right-6 z-30 border-[#d4af37]/35 p-2 text-[#d4af37] hover:text-[#fff4d4]"
      data-testid="premiere-hud__toggle"
    />
  );
}