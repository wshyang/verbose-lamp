import type { ResearchSection } from '../model/types';

export const GATSBY_RESEARCH_SECTIONS: readonly ResearchSection[] = [
  {
    id: 'pedigree',
    numeral: '01',
    title: 'Creative Lineage & Studio Architecture',
    subtitle: 'Bazmark · Like Minded Studio · Deva Studios · Method Studios',
    credits: 'Dir. Baz Luhrmann & Catherine Martin · Title Design: Silvana Azzi Heras, Finn Spencer & Luca Ionescu',
    summary:
      'Baz Luhrmann and production designer Catherine Martin commissioned Sydney-based Like Minded Studio (Luca Ionescu) to craft the core Art Deco logotype and bespoke display alphabet, Tiffany & Co. to co-develop the interlocking octagonal GG signet monogram, and Deva Studios / Method Studios to extrude and animate the intricate 3D golden lattice sequences.',
    bulletPoints: [
      'Inspired directly by 1920s German/American Art Deco geometric ornament plates by K.H. Schaefer and the inline Deco display face Atlas.',
      'Opening bookend mimics a 1920s black-and-white silver-nitrate cinema screen before blooming into stereoscopic 3D gold and the emerald dock light.',
      'Closing main-on-end sequence reverses the journey, pulling the camera backward through successive golden Art Deco portals over a recessed tessellated wall.',
    ],
  },
  {
    id: 'frames',
    numeral: '02',
    title: '3D Extruded Golden Lattice & Trim-Path Choreography',
    subtitle: 'Multi-Plane Bevelled 24k Brass & Gold Filigree',
    credits: 'Modeled as chamfered 3D rails rather than flat 2D vector strokes',
    summary:
      'What makes the golden frames feel luxurious in motion is that every line is a 3D bevelled metallic rail distributed across multiple Z-depth planes. Frames never simply fade in: golden pinstripes shoot outward from central symmetry axes, miter around 45° octagonal corners and stepped skyscraper brackets, and fan out into radial Chrysler sunbursts.',
    bulletPoints: [
      'Symmetrical Grow-Out: Horizontal rules expand from center while vertical columns and diamond spears interlock with staggered timing delays.',
      '45° Chamfered Specular Glints: Angled bevel faces catch warm ballroom reflections and diagonal travelling light sweeps.',
      'Parting Theatrical Portals: At the end of each billing hold, left and right frame assemblies slide apart as the camera pushes straight through the center.',
    ],
  },
  {
    id: 'typography',
    numeral: '03',
    title: 'Bespoke "Deco Pinstripe" Alternating Typography',
    subtitle: 'Solid Chiseled Platinum Paired with 4-Line Inline Characters',
    credits: 'Custom Type System by Like Minded Studio (Sydney)',
    summary:
      'A signature detail of both the main "THE GREAT GATSBY" lockup and the trailer/credit cards is a custom character-alternation rule: solid, prismatic silver-platinum characters alternate letter-by-letter with hollow 4-line inline pinstriped characters.',
    bulletPoints: [
      'In "GATSBY", tall condensed letterforms alternate concentric 4-stripe inline ribs (G, T, B) with solid chiseled metallic faces (A, S, Y).',
      'Dual-Metal Materiality: Front letter faces gleam in cool mirror-polished silver/platinum while the 3D extruded side walls glow in warm 24k gold.',
      'Architectural Nesting: "THE" sits inside a stepped upper Deco keystone arch, "GREAT" spans a wide-tracked horizontal frieze, and "GATSBY" anchors the central plaque.',
    ],
  },
  {
    id: 'webgl',
    numeral: '04',
    title: 'How This WebGL Engine Recreates the Sequence',
    subtitle: 'Custom GLSL Trim-Shaders, Bevel Normal Synthesis & Post-Processing',
    credits: 'Real-Time Three.js WebGL Pipeline',
    summary:
      'Every frame, glyph, reflection, and particle in this web application is synthesized procedurally in real time on the GPU without pre-rendered video.',
    bulletPoints: [
      'Custom GLSL Trim-Path Shader: Every 3D bevelled gold bar carries normalized path-length and layer-delay vertex attributes with an incandescent molten-gold leading tip.',
      'Procedural Deco Pinstripe & Normal-Map Engine: Generates alternating 4-line concentric inline Deco glyphs, computes chamfer bevel normal maps, and extrudes 3D gold depth shells.',
      'Cinema Post-Processing: Combines a custom Art Deco Ballroom PMREM reflection environment, UnrealBloom specular halation, and a 1920s silver-nitrate grain/vignette shader.',
    ],
  },
];