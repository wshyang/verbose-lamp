import { PartyPopper } from 'lucide-react';
import { Button } from '@/shared/ui';

interface EventNightLauncherProps {
  onOpen: () => void;
  className?: string;
}

/** Header entry point for the Dinner & Dance demo; the host decides how it opens. */
export function EventNightLauncher({ onOpen, className }: EventNightLauncherProps) {
  return (
    <Button
      type="button"
      onClick={onOpen}
      className={className}
      title="Open the Dinner & Dance Event Night demo"
      data-testid="event-night__launch"
    >
      <PartyPopper className="h-3.5 w-3.5 text-[#f8e29b]" />
      <span className="hidden sm:inline">Dinner &amp; Dance</span>
      <span className="sm:hidden">Event</span>
    </Button>
  );
}
