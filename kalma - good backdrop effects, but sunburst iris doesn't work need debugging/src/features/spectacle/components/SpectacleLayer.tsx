import type { ReactNode, RefObject } from 'react';

interface SpectacleLayerProps {
  hostRef: RefObject<HTMLDivElement | null>;
  announcement: string;
  children: ReactNode;
}

/**
 * Mounts the stage host and the visually hidden live region. The engine
 * appends its canvases to this host lazily; canvas pixels stay invisible to
 * assistive tech, results are announced here (ADDENDUM-020 §3.1).
 */
export function SpectacleLayer({ hostRef, announcement, children }: SpectacleLayerProps) {
  return (
    <div ref={hostRef} className="relative min-h-screen overflow-hidden" data-testid="spectacle-layer__host">
      {children}
      <span aria-live="polite" role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}