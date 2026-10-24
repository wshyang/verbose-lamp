import type * as THREE from 'three';

export interface DecoTextOptions {
  text: string;
  worldHeight: number;
  extrudeDepth?: number;
  /** Face and extrusion finish for generated title lettering. */
  finish?: 'platinum-gold' | 'pure-gold';
  /** Alternate solid and inline glyphs. */
  alternatePinstripes?: boolean;
  /** Letter spacing in glyph-height units. */
  tracking?: number;
  /** Stroke thickness ratio. */
  weight?: 'hero' | 'regular' | 'fine';
}

export interface DecoTextRig {
  group: THREE.Group;
  width: number;
  height: number;
  setReveal: (reveal: number, shimmerPhase: number, opacity?: number) => void;
  dispose: () => void;
}
