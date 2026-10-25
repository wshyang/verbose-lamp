import React from 'react';

/** Fig. I — an inline four-stripe glyph, a solid chiselled letter, and an inline T. */
export const PinstripePlate: React.FC = () => (
      <svg viewBox="0 0 220 90" className="w-full h-20 my-1">
        {/* 4-line inline G */}
        <g fill="none" stroke="#f8e29b" strokeLinecap="butt">
          <path d="M55 24 A22 22 0 1 0 55 66 L55 48 L36 48" strokeWidth="13" opacity="0.18" />
          <path d="M55 24 A22 22 0 1 0 55 66 L55 48 L36 48" strokeWidth="11" />
          <path d="M55 24 A22 22 0 1 0 55 66 L55 48 L36 48" stroke="#0d0a12" strokeWidth="7.8" />
          <path d="M55 24 A22 22 0 1 0 55 66 L55 48 L36 48" stroke="#f8e29b" strokeWidth="4.6" />
          <path d="M55 24 A22 22 0 1 0 55 66 L55 48 L36 48" stroke="#0d0a12" strokeWidth="1.6" />
        </g>
        {/* Solid Chiseled A */}
        <g fill="none" stroke="#e9eef7" strokeWidth="11" strokeLinejoin="miter">
          <path d="M84 70 L104 18 L124 70" />
          <path d="M90 54 L118 54" strokeWidth="8" />
        </g>
        {/* 4-line inline T */}
        <g fill="none" strokeLinecap="butt">
          <path d="M144 20 L190 20 M167 20 L167 70" stroke="#f8e29b" strokeWidth="11" />
          <path d="M144 20 L190 20 M167 20 L167 70" stroke="#0d0a12" strokeWidth="7.8" />
          <path d="M144 20 L190 20 M167 20 L167 70" stroke="#f8e29b" strokeWidth="4.6" />
          <path d="M144 20 L190 20 M167 20 L167 70" stroke="#0d0a12" strokeWidth="1.6" />
        </g>
      </svg>
);
