import { SpectacleProvider } from '@/features/spectacle';
import { PremiereSurfaces } from './components/PremiereSurfaces';

interface GatsbyPremiereProps {
  onOpenEventNight: () => void;
}

/**
 * Host shell. One spectacle stage wraps the whole premiere, so any surface can
 * play an effect and the header console can drive it (ADDENDUM-020 §3.9).
 */
export function GatsbyPremiere({ onOpenEventNight }: GatsbyPremiereProps) {
  return (
    <SpectacleProvider className="relative h-dvh w-screen select-none overflow-hidden bg-[#050407]">
      <PremiereSurfaces onOpenEventNight={onOpenEventNight} />
    </SpectacleProvider>
  );
}
