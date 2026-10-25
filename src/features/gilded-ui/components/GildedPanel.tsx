import type { ReactNode } from 'react';
import { chamferPlaque } from '../model/plaqueGeometry';

interface GildedPanelProps {
  children: ReactNode;
  className?: string;
}

/** Generic chamfered container with the shared plaque gradients. */
export function GildedPanel({ children, className = '' }: GildedPanelProps) {
  return (
    <div className={`relative ${className}`}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <path d={chamferPlaque(100, 100, 6)} fill="url(#gilded-plaque)" stroke="url(#gilded-edge)" strokeWidth="0.7" />
      </svg>
      <div className="relative">{children}</div>
    </div>
  );
}