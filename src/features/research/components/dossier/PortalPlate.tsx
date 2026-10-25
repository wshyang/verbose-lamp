import React from 'react';

/** Fig. III — nested portal rectangles retreating into a Z-corridor. */
export const PortalPlate: React.FC = () => (
      <svg viewBox="0 0 220 90" className="w-full h-20 my-1">
        <rect x="28" y="14" width="164" height="62" fill="none" stroke="#f8e29b" strokeWidth="1.6" />
        <rect x="54" y="24" width="112" height="42" fill="none" stroke="#d4af37" strokeWidth="1.2" opacity="0.75" />
        <rect x="78" y="33" width="64" height="24" fill="none" stroke="#d4af37" strokeWidth="1" opacity="0.5" />
        <circle cx="110" cy="45" r="3.5" fill="#14f582" />
        <path d="M16 45 L42 45 M204 45 L178 45" stroke="#fff4d4" strokeWidth="1.4" />
      </svg>
);
