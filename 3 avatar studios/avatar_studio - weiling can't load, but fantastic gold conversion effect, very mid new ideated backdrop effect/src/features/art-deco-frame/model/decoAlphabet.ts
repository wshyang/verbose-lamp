export interface GlyphDef {
  /** Width relative to cap height (1.0 = square) */
  w: number;
  build: (p: Path2D, w: number, h: number) => void;
}

/**
 * Bespoke 1920s Art Deco condensed geometric skeleton alphabet inspired by
 * K.H. Schaefer's Deco ornament plates & Like Minded Studio's Gatsby logotype.
 * Coordinates: x in [0, w], y in [0, h] where y = 0 is cap-top and y = h is baseline.
 */
export const DECO_ALPHABET: Record<string, GlyphDef> = {
  A: {
    w: 0.64,
    build: (p, w, h) => {
      p.moveTo(0, h);
      p.lineTo(w * 0.5, h * 0.02);
      p.lineTo(w, h);
      // Signature low Art Deco crossbar
      p.moveTo(w * 0.16, h * 0.68);
      p.lineTo(w * 0.84, h * 0.68);
    },
  },
  B: {
    w: 0.56,
    build: (p, w, h) => {
      // Asymmetric Art Deco upper small bowl, tall lower bowl
      const midY = h * 0.42;
      const r1 = midY * 0.5;
      const r2 = (h - midY) * 0.5;
      p.moveTo(0, 0);
      p.lineTo(0, h);
      p.moveTo(0, 0);
      p.lineTo(w - r1, 0);
      p.arc(w - r1, r1, r1, -Math.PI / 2, Math.PI / 2);
      p.lineTo(0, midY);
      p.moveTo(0, midY);
      p.lineTo(w - r2, midY);
      p.arc(w - r2, midY + r2, r2, -Math.PI / 2, Math.PI / 2);
      p.lineTo(0, h);
    },
  },
  C: {
    w: 0.58,
    build: (p, w, h) => {
      const r = w * 0.5;
      p.arc(r, r, r, -Math.PI * 0.18, Math.PI, true);
      p.lineTo(0, h - r);
      p.arc(r, h - r, r, Math.PI, Math.PI * 0.18, true);
    },
  },
  D: {
    w: 0.58,
    build: (p, w, h) => {
      const r = w * 0.52;
      p.moveTo(0, 0);
      p.lineTo(0, h);
      p.moveTo(0, 0);
      p.lineTo(w - r, 0);
      p.arc(w - r, r, r, -Math.PI / 2, 0);
      p.lineTo(w, h - r);
      p.arc(w - r, h - r, r, 0, Math.PI / 2);
      p.lineTo(0, h);
    },
  },
  E: {
    w: 0.5,
    build: (p, w, h) => {
      p.moveTo(w, 0);
      p.lineTo(0, 0);
      p.lineTo(0, h);
      p.lineTo(w, h);
      p.moveTo(0, h * 0.58);
      p.lineTo(w * 0.78, h * 0.58);
    },
  },
  F: {
    w: 0.48,
    build: (p, w, h) => {
      p.moveTo(w, 0);
      p.lineTo(0, 0);
      p.lineTo(0, h);
      p.moveTo(0, h * 0.54);
      p.lineTo(w * 0.78, h * 0.54);
    },
  },
  G: {
    w: 0.58,
    build: (p, w, h) => {
      // Iconic narrow tall Gatsby Art Deco 'G' with crisp horizontal inward spur
      const r = w * 0.5;
      p.arc(r, r, r, -Math.PI * 0.15, -Math.PI, true);
      p.lineTo(0, h - r);
      p.arc(r, h - r, r, Math.PI, 0, true);
      p.lineTo(w, h * 0.54);
      p.lineTo(w * 0.46, h * 0.54);
    },
  },
  H: {
    w: 0.58,
    build: (p, w, h) => {
      p.moveTo(0, 0);
      p.lineTo(0, h);
      p.moveTo(w, 0);
      p.lineTo(w, h);
      p.moveTo(0, h * 0.58);
      p.lineTo(w, h * 0.58);
    },
  },
  I: {
    w: 0.16,
    build: (p, w, h) => {
      p.moveTo(w * 0.5, 0);
      p.lineTo(w * 0.5, h);
    },
  },
  J: {
    w: 0.48,
    build: (p, w, h) => {
      const r = w * 0.5;
      p.moveTo(w, 0);
      p.lineTo(w, h - r);
      p.arc(r, h - r, r, 0, Math.PI, false);
    },
  },
  K: {
    w: 0.62,
    build: (p, w, h) => {
      p.moveTo(0, 0);
      p.lineTo(0, h);
      p.moveTo(w, 0);
      p.lineTo(0, h * 0.56);
      p.lineTo(w, h);
    },
  },
  L: {
    w: 0.48,
    build: (p, w, h) => {
      p.moveTo(0, 0);
      p.lineTo(0, h);
      p.lineTo(w, h);
    },
  },
  M: {
    w: 0.78,
    build: (p, w, h) => {
      p.moveTo(0, h);
      p.lineTo(0, 0);
      p.lineTo(w * 0.5, h * 0.76);
      p.lineTo(w, 0);
      p.lineTo(w, h);
    },
  },
  N: {
    w: 0.62,
    build: (p, w, h) => {
      p.moveTo(0, h);
      p.lineTo(0, 0);
      p.lineTo(w, h);
      p.lineTo(w, 0);
    },
  },
  O: {
    w: 0.6,
    build: (p, w, h) => {
      const r = w * 0.5;
      p.moveTo(0, r);
      p.arc(r, r, r, Math.PI, 0, false);
      p.lineTo(w, h - r);
      p.arc(r, h - r, r, 0, Math.PI, false);
      p.closePath();
    },
  },
  P: {
    w: 0.54,
    build: (p, w, h) => {
      const bowlH = h * 0.52;
      const r = bowlH * 0.5;
      p.moveTo(0, h);
      p.lineTo(0, 0);
      p.lineTo(w - r, 0);
      p.arc(w - r, r, r, -Math.PI / 2, Math.PI / 2);
      p.lineTo(0, bowlH);
    },
  },
  Q: {
    w: 0.62,
    build: (p, w, h) => {
      const r = w * 0.5;
      p.moveTo(0, r);
      p.arc(r, r, r, Math.PI, 0, false);
      p.lineTo(w, h - r);
      p.arc(r, h - r, r, 0, Math.PI, false);
      p.closePath();
      p.moveTo(w * 0.52, h * 0.68);
      p.lineTo(w * 1.04, h * 1.04);
    },
  },
  R: {
    w: 0.56,
    build: (p, w, h) => {
      const bowlH = h * 0.5;
      const r = bowlH * 0.5;
      p.moveTo(0, h);
      p.lineTo(0, 0);
      p.lineTo(w - r, 0);
      p.arc(w - r, r, r, -Math.PI / 2, Math.PI / 2);
      p.lineTo(0, bowlH);
      p.moveTo(w * 0.44, bowlH);
      p.lineTo(w, h);
    },
  },
  S: {
    w: 0.54,
    build: (p, w, h) => {
      // C1 tangent-continuous Art Deco double-bowl S
      const cx = w * 0.5;
      const rTop = h * 0.235;
      const rBot = h * 0.255;
      p.arc(cx, rTop, rTop, -Math.PI * 0.15, -Math.PI * 1.32, true);
      p.arc(cx, h - rBot, rBot, -Math.PI * 0.32, Math.PI * 0.88, false);
    },
  },
  T: {
    w: 0.54,
    build: (p, w, h) => {
      p.moveTo(0, 0);
      p.lineTo(w, 0);
      p.moveTo(w * 0.5, 0);
      p.lineTo(w * 0.5, h);
    },
  },
  U: {
    w: 0.58,
    build: (p, w, h) => {
      const r = w * 0.5;
      p.moveTo(0, 0);
      p.lineTo(0, h - r);
      p.arc(r, h - r, r, Math.PI, 0, true);
      p.lineTo(w, 0);
    },
  },
  V: {
    w: 0.62,
    build: (p, w, h) => {
      p.moveTo(0, 0);
      p.lineTo(w * 0.5, h * 0.98);
      p.lineTo(w, 0);
    },
  },
  W: {
    w: 0.84,
    build: (p, w, h) => {
      p.moveTo(0, 0);
      p.lineTo(w * 0.26, h * 0.98);
      p.lineTo(w * 0.5, h * 0.26);
      p.lineTo(w * 0.74, h * 0.98);
      p.lineTo(w, 0);
    },
  },
  X: {
    w: 0.6,
    build: (p, w, h) => {
      p.moveTo(0, 0);
      p.lineTo(w, h);
      p.moveTo(w, 0);
      p.lineTo(0, h);
    },
  },
  Y: {
    w: 0.58,
    build: (p, w, h) => {
      p.moveTo(0, 0);
      p.lineTo(w * 0.5, h * 0.52);
      p.lineTo(w, 0);
      p.moveTo(w * 0.5, h * 0.52);
      p.lineTo(w * 0.5, h);
    },
  },
  Z: {
    w: 0.56,
    build: (p, w, h) => {
      p.moveTo(0, 0);
      p.lineTo(w, 0);
      p.lineTo(0, h);
      p.lineTo(w, h);
    },
  },
  '0': {
    w: 0.56,
    build: (p, w, h) => {
      const r = w * 0.5;
      p.moveTo(0, r);
      p.arc(r, r, r, Math.PI, 0, false);
      p.lineTo(w, h - r);
      p.arc(r, h - r, r, 0, Math.PI, false);
      p.closePath();
    },
  },
  '1': {
    w: 0.3,
    build: (p, w, h) => {
      p.moveTo(w * 0.15, h * 0.18);
      p.lineTo(w * 0.55, 0);
      p.lineTo(w * 0.55, h);
    },
  },
  '2': {
    w: 0.54,
    build: (p, w, h) => {
      const r = w * 0.5;
      p.arc(r, r, r, Math.PI, Math.PI * 0.18, false);
      p.lineTo(0, h);
      p.lineTo(w, h);
    },
  },
  '3': {
    w: 0.52,
    build: (p, w, h) => {
      const r1 = h * 0.23;
      const r2 = h * 0.27;
      p.moveTo(0, 0);
      p.lineTo(w, 0);
      p.lineTo(w * 0.42, h * 0.44);
      p.arc(w * 0.48, h - r2, r2, -Math.PI * 0.45, Math.PI * 0.85, false);
      void r1;
    },
  },
  '4': {
    w: 0.58,
    build: (p, w, h) => {
      p.moveTo(w * 0.72, h);
      p.lineTo(w * 0.72, 0);
      p.lineTo(0, h * 0.68);
      p.lineTo(w, h * 0.68);
    },
  },
  '5': {
    w: 0.52,
    build: (p, w, h) => {
      const r = h * 0.28;
      p.moveTo(w, 0);
      p.lineTo(0, 0);
      p.lineTo(0, h * 0.44);
      p.lineTo(w * 0.5, h * 0.44);
      p.arc(w * 0.5, h - r, r, -Math.PI * 0.5, Math.PI * 0.85, false);
    },
  },
  '6': {
    w: 0.54,
    build: (p, w, h) => {
      const r = w * 0.5;
      p.moveTo(w * 0.78, 0);
      p.lineTo(w * 0.08, h - r * 1.35);
      p.moveTo(w, h - r);
      p.arc(r, h - r, r, 0, Math.PI * 2, false);
    },
  },
  '7': {
    w: 0.52,
    build: (p, w, h) => {
      p.moveTo(0, 0);
      p.lineTo(w, 0);
      p.lineTo(w * 0.32, h);
    },
  },
  '8': {
    w: 0.54,
    build: (p, w, h) => {
      const r1 = h * 0.23;
      const r2 = h * 0.27;
      p.arc(w * 0.5, r1, r1, 0, Math.PI * 2);
      p.moveTo(w * 0.5 + r2, h - r2);
      p.arc(w * 0.5, h - r2, r2, 0, Math.PI * 2);
    },
  },
  '9': {
    w: 0.54,
    build: (p, w, h) => {
      const r = w * 0.5;
      p.arc(r, r, r, 0, Math.PI * 2);
      p.moveTo(w, r);
      p.lineTo(w * 0.25, h);
    },
  },
  '&': {
    w: 0.64,
    build: (p, w, h) => {
      p.moveTo(w, h);
      p.lineTo(w * 0.16, h * 0.28);
      p.arc(w * 0.42, h * 0.18, h * 0.18, Math.PI * 0.85, -Math.PI * 0.15, false);
      p.lineTo(w * 0.12, h * 0.66);
      p.arc(w * 0.42, h * 0.74, h * 0.26, Math.PI * 0.9, Math.PI * 0.05, true);
    },
  },
  '.': {
    w: 0.18,
    build: (p, w, h) => {
      const cx = w * 0.5;
      const cy = h * 0.88;
      p.moveTo(cx, cy - h * 0.05);
      p.lineTo(cx + h * 0.05, cy);
      p.lineTo(cx, cy + h * 0.05);
      p.lineTo(cx - h * 0.05, cy);
      p.closePath();
    },
  },
  '·': {
    w: 0.22,
    build: (p, w, h) => {
      const cx = w * 0.5;
      const cy = h * 0.5;
      p.moveTo(cx, cy - h * 0.06);
      p.lineTo(cx + h * 0.06, cy);
      p.lineTo(cx, cy + h * 0.06);
      p.lineTo(cx - h * 0.06, cy);
      p.closePath();
    },
  },
  '-': {
    w: 0.38,
    build: (p, w, h) => {
      p.moveTo(w * 0.1, h * 0.52);
      p.lineTo(w * 0.9, h * 0.52);
    },
  },
  "'": {
    w: 0.16,
    build: (p, w, h) => {
      p.moveTo(w * 0.5, 0);
      p.lineTo(w * 0.35, h * 0.26);
    },
  },
};
