import React from 'react';

/**
 * Shared gold vocabulary with the WebGL frame material: deep #8c661c → primary
 * #d4af37 → bright #f8e29b, a warm sheen sweep on an eight-second period (the
 * shader sweeps `mod(t * 0.55, 4.4)`), a brushed grain, and a soft bloom.
 */

export interface GoldenQrIds {
  readonly plaque: string;
  readonly gold: string;
  readonly sheen: string;
  readonly brush: string;
  readonly glow: string;
}

export function buildGoldenQrIds(seed: string): GoldenQrIds {
  const safe = seed.replace(/[^a-zA-Z0-9_-]/g, '');
  return {
    plaque: `gq-${safe}-plaque`,
    gold: `gq-${safe}-gold`,
    sheen: `gq-${safe}-sheen`,
    brush: `gq-${safe}-brush`,
    glow: `gq-${safe}-glow`,
  };
}

interface GoldenQrDefsProps {
  ids: GoldenQrIds;
  viewBox: number;
  isShimmering: boolean;
}

const SHEEN_PERIOD = '8s';

export const GoldenQrDefs: React.FC<GoldenQrDefsProps> = ({ ids, viewBox, isShimmering }) => (
  <defs>
    <radialGradient id={ids.plaque} cx="50%" cy="42%" r="75%">
      <stop offset="0%" stopColor="#17110a" />
      <stop offset="55%" stopColor="#0a0710" />
      <stop offset="100%" stopColor="#050406" />
    </radialGradient>

    <linearGradient id={ids.gold} x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="#8c661c" />
      <stop offset="28%" stopColor="#d4af37" />
      <stop offset="50%" stopColor="#f8e29b" />
      <stop offset="72%" stopColor="#d4af37" />
      <stop offset="100%" stopColor="#8c661c" />
    </linearGradient>

    <linearGradient
      id={ids.sheen}
      gradientUnits="userSpaceOnUse"
      x1={0}
      y1={0}
      x2={viewBox * 0.5}
      y2={viewBox * 0.4}
    >
      <stop offset="0" stopColor="#fff6dc" stopOpacity={0} />
      <stop offset="0.42" stopColor="#fff6dc" stopOpacity={0} />
      <stop offset="0.5" stopColor="#ffe085" stopOpacity={0.9} />
      <stop offset="0.58" stopColor="#fff6dc" stopOpacity={0} />
      <stop offset="1" stopColor="#fff6dc" stopOpacity={0} />
      {isShimmering ? (
        <animateTransform
          attributeName="gradientTransform"
          type="translate"
          from={`${-viewBox * 1.1} 0`}
          to={`${viewBox * 1.4} 0`}
          dur={SHEEN_PERIOD}
          repeatCount="indefinite"
        />
      ) : null}
    </linearGradient>

    <filter id={ids.brush} x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.03 1.1" numOctaves={2} seed={7} result="grain" />
      <feColorMatrix in="grain" type="saturate" values="0" result="mono" />
      <feComponentTransfer in="mono" result="faint">
        <feFuncA type="linear" slope={0.32} />
      </feComponentTransfer>
      <feComposite in="faint" in2="SourceGraphic" operator="in" />
    </filter>

    <filter id={ids.glow} x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation={0.55} />
    </filter>
  </defs>
);
