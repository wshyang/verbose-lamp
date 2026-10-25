import { useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { chasePattern, type ChaseMode } from '../model/chasePattern';

interface MarqueeBorderProps {
  mode?: ChaseMode;
  bulbCount?: number;
  className?: string;
}

interface BulbPos {
  left: string;
  top: string;
}

function perimeterPositions(count: number): readonly BulbPos[] {
  return Array.from({ length: count }, (_, i) => {
    const s = (i / count) * 4;
    if (s < 1) return { left: `${s * 100}%`, top: '0%' };
    if (s < 2) return { left: '100%', top: `${(s - 1) * 100}%` };
    if (s < 3) return { left: `${(3 - s) * 100}%`, top: '100%' };
    return { left: '0%', top: `${(4 - s) * 100}%` };
  });
}

/** DOM marquee bulbs with a pure chase pattern — crisp at any resolution. */
export function MarqueeBorder({ mode = 'chase', bulbCount = 56, className = '' }: MarqueeBorderProps) {
  const reduced = useReducedMotion();
  const [frame, setFrame] = useState(0);
  const positions = useMemo(() => perimeterPositions(bulbCount), [bulbCount]);

  useEffect(() => {
    if (reduced) return;
    const timer = window.setInterval(() => setFrame((f) => f + 1), 140);
    return () => window.clearInterval(timer);
  }, [reduced]);

  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`} aria-hidden="true">
      {positions.map((pos, i) => {
        const brightness = reduced ? 1 : chasePattern(i, frame, mode);
        return (
          <span
            key={i}
            data-testid="marquee-border__bulb"
            className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: pos.left,
              top: pos.top,
              background: `radial-gradient(circle, #fff6d8 0%, #f2c964 55%, #7a5a20 100%)`,
              opacity: 0.35 + brightness * 0.65,
              boxShadow: `0 0 ${4 + brightness * 10}px ${brightness * 3}px rgba(255,214,120,${0.25 + brightness * 0.45})`,
              transition: 'opacity 120ms linear, box-shadow 120ms linear',
            }}
          />
        );
      })}
    </div>
  );
}