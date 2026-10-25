import React from 'react';

/** Fig. II — the six-facet bevelled rail cross-section, with its specular rays. */
export const ChamferPlate: React.FC = () => (
      <svg viewBox="0 0 220 90" className="w-full h-20 my-1">
        <polygon
          points="36,68 58,34 162,34 184,68"
          fill="rgba(212,175,55,0.18)"
          stroke="#f8e29b"
          strokeWidth="1.8"
        />
        <line x1="78" y1="34" x2="78" y2="68" stroke="#d4af37" strokeDasharray="3 3" />
        <line x1="142" y1="34" x2="142" y2="68" stroke="#d4af37" strokeDasharray="3 3" />
        {/* Specular rays */}
        <line x1="46" y1="48" x2="26" y2="22" stroke="#fff6dc" strokeWidth="1.4" />
        <line x1="110" y1="34" x2="110" y2="12" stroke="#fff6dc" strokeWidth="1.4" />
        <line x1="174" y1="48" x2="194" y2="22" stroke="#fff6dc" strokeWidth="1.4" />
        <text x="110" y="83" textAnchor="middle" fill="#d4af37" fontSize="9" letterSpacing="2">
          45° CHAMFERED PRISM
        </text>
      </svg>
);
