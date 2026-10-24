/**
 * The event's own kit: mascot, badges, coins, trophies and the earliest sprites.
 *
 * Two characters per cell, `<material><tone>` (ADR-070); `..` is transparent. Pure data, no I/O.
 */
export const GRIDS = {
  /*
   * Otter holding a shell — the highest-recognition local animal in the catalogue, and the one
   * that took a design decision rather than a redraw. Drawn as a head alone it read as a bat,
   * then as a bear: no 16px mammal head is species-specific. The shell is what makes it an
   * otter, so the pose carries the identification and the face only has to be friendly.
   */
  otter: [
    '................................',
    '........t0t0......t0t0..........',
    '......t0t1t1t0..t0t1t2t0........',
    '....t0t1t1t1t1t1t1t1t2t2t0......',
    '..t0t1t1t1t1t1t1t1t1t2t2t2t0....',
    '..t0t1t1k2t1t1t1t1k2t1t2t2t0....',
    '..t0t1t1t1t1t1t1t1t1t1t2t2t0....',
    '..t0t1t1t1f1f1f1f1t1t2t2t2t0....',
    '..t0t1t1f1f1k2k2f1f1t2t2t2t0....',
    '....t0t1f1f1f1f1f1f1t2t2t0......',
    '....t0t1t1t1t1t1t1t1t2t2t0......',
    '......t0t0t1t1t1t1t2t2t0........',
    '..t0t1t0..n0n1n1n1n1n0..t0t2t0..',
    '..t0t0....n0n1n0n1n0......t0t0..',
    '..........n0n0n0n0n0............',
    '................................',
  ],

  // Sportsmanship. Two hands, two different skin ramps — the point of having three.
  highfive: [
    '................................',
    '................................',
    '....f0f0..........q0q0..........',
    '..f0f1f1f0......q0q1q1q0........',
    '..f0f1f1f1f0..q0q1q1q1q0........',
    'f0f1f1f1f1f0..q0q1q1q1q1q0......',
    'f0f1f1f1f1f1f0q0q1q1q1q1q1q0....',
    'f0f1f1f1f1f1f0q0q1q1q1q1q1q0....',
    '..f0f1f1f1f2f0q0q2q1q1q1q0......',
    '....f0f1f2f2f0q0q2q2q2q0........',
    '......f0f2f2f0q0q2q2q0..........',
    '........f0f0f0q0q0q0............',
    '................................',
    '................................',
    '................................',
    '................................',
  ],

  // Numbered pinny for a roster.
  bib: [
    '................................',
    '................................',
    '......w0w0......w0w0............',
    '......w0w1......w0w2............',
    '....w0w0w1w0w0w0w0w2w0..........',
    '....w0w1w1w1w1w1w1w2w0..........',
    '....w0w1w1k2k2k2w1w2w0..........',
    '....w0w1w1w1w1k2w1w2w0..........',
    '....w0w1w1w1k2k2w1w2w0..........',
    '....w0w1w1k2k2k2k2w2w0..........',
    '....w0w2w2w2w2w2w2w3w0..........',
    '....w0w0w0w0w0w0w0w0w0..........',
    '................................',
    '................................',
    '................................',
    '................................',
  ],

  // Kueh lapis, the event mascot. One material per layer, one shared wood outline — outlining
  // each layer in its own ramp would draw nine horizontal rules and lose the slice.
  kueh: [
    '................................',
    '................................',
    '....t0t0t0t0t0t0t0t0t0t0t0t0....',
    '....t0n1n1n2n2n2n2n2n2n3n3t0....',
    '....t0r1r1r2r2r2r2r2r2r3r3t0....',
    '....t0o1o1o2o2o2o2o2o2o3o3t0....',
    '....t0g1g1g2g2g2g2g2g2g3g3t0....',
    '....t0l1l1l2l2l2l2l2l2l3l3t0....',
    '....t0p1p1p2p2p2p2p2p2p3p3t0....',
    '....t0b1b1b2b2b2b2b2b2b3b3t0....',
    '....t0v1v1v2v2v2v2v2v2v3v3t0....',
    '....t0n1n1n2n2n2n2n2n2n3n3t0....',
    '....t0w1w1w1w2w2w2w2w2w3w3t0....',
    '....t0t0t0t0t0t0t0t0t0t0t0t0....',
    '................................',
    '................................',
  ],

  // The captain's ball: sea and sunset panels over white, with a gold band.
  volleyball: [
    '................................',
    '..........w0w0w0w0w0w0..........',
    '......w0w0b2b2w1w1r2r2w0w0......',
    '....w0b1b2b2w1w1w1w1r2r3w0w0....',
    '..w0b1b2b2b2w1w1w1w1r2r2r3w0w0..',
    '..w0b1b2b2b2w1w1w1w1r2r2r3w3w0..',
    'w0b1b2b2b2b3w1w1w1w1r2r2r3r3w3w0',
    'w0b2b2b2b3b3w1w1w1w1w2w2w2w3w3w0',
    'w0w1w1w1w1w1g2g2w1w1w2w2w3w3w3w0',
    '..w0w1w1w1g2g2g2g2w1w2w3w3w3w0..',
    '..w0w1w1g2g2g2g2g2g2w2w3w3w3w0..',
    '....w0w1g2g2g2g2g2g3w3w3w3w0....',
    '......w0w0g2g2g2g3g3w3w0w0......',
    '..........w0w0w0w0w0w0..........',
    '................................',
    '................................',
  ],

  // Completed-scan stamp. The tick is palm green so it cannot be confused with the console's
  // own success colour, which is what the old flat version borrowed.
  stamp: [
    '................................',
    '....w0w0w0w0w0w0w0w0w0w0w0w0....',
    '....w0w1w1w1w1w1w1w1w1w2w2w0....',
    '....w0w1w1w1w1w1w1w1p1p2w2w0....',
    '....w0w1w1w1w1w1w1p1p2p2w3w0....',
    '....w0w1w1w1w1w1p1p2p2w2w3w0....',
    '....w0w1p1w1p1p2p2p3w2w2w3w0....',
    '....w0w1p1p2p2p3p3w2w2w3w3w0....',
    '....w0w1w1p2p3w2w2w2w3w3w3w0....',
    '....w0w2w2w2w2w2w3w3w3w3w3w0....',
    '....w0w0w0w0w0w0w0w0w0w0w0w0....',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
  ],

  // The QR tile for the nav. Modules are ink at full contrast — a QR that shades is a QR that
  // does not scan, and this one is decorative but should still look scannable.
  badge: [
    '................................',
    '..w0w0w0w0w0w0w0w0w0w0w0w0w0w0..',
    '..w0w1w1w1w1w1w1w1w1w1w1w1w2w0..',
    '..w0w1k2k2k2w1w1w1w1k2k2k2w2w0..',
    '..w0w1k2w1k2w1k2k2w1k2w1k2w2w0..',
    '..w0w1k2k2k2w1w1w1w1k2k2k2w2w0..',
    '..w0w1w1w1w1w1k2w1k2w1w1w1w2w0..',
    '..w0w1w1k2w1k2k2w1k2k2w1k2w2w0..',
    '..w0w1k2w1w1w1k2w1k2w1w1w1w2w0..',
    '..w0w1k2k2k2w1w1k2w1k2k2w1w2w0..',
    '..w0w1k2w1k2w1w1w1w1k2w1w1w3w0..',
    '..w0w1k2k2k2w1k2w1k2k2k2w1w3w0..',
    '..w0w2w2w2w2w2w2w2w2w2w2w2w3w0..',
    '..w0w0w0w0w0w0w0w0w0w0w0w0w0w0..',
    '................................',
    '................................',
  ],

  // The "Me" tab face. Skin is the sand ramp, as it was before ramps existed.
  face: [
    '................................',
    '..........t0t0t0t0t0t0..........',
    '......t0t0t1t1t1t1t2t2t0t0......',
    '....t0t1t1t1t1t1t1t2t2t2t3t0....',
    '....t0t0t0t0t0t0t0t0t0t0t0t0....',
    '..s0s1s1s1s1s1s1s2s2s2s3s3s3s0..',
    '..s0s1s0s0s1s1s1s0s0s2s3s3s3s0..',
    '..s0s1s0s0s1s1s1s0s0s2s3s3s3s0..',
    '..s0s1s1s1s1s1s1s2s2s2s3s3s3s0..',
    '..s0s1s1s0s1s1s0s2s2s2s3s3s3s0..',
    '..s0s1s1s1s0s0s0s2s2s2s3s3s3s0..',
    '....s0s1s1s1s1s1s2s2s3s3s3s0....',
    '......s0s0s1s1s2s2s3s3s0s0......',
    '..........s0s0s0s0s0s0..........',
    '................................',
    '................................',
  ],

  /*
   * The Public Service Division mark: the lettermark, the official navy and the crimson rule.
   * The full roundel's three words turn to mush below ~48px. Colours sampled from
   * images/ingest/PSD_logo-01-320x320.png, so they are ramp `d` and `x` rather than tokens.
   */
  psd: [
    '................................',
    '................................',
    '..d0d0d0d0d0d0d0d0d0d0d0d0d0d0..',
    'd0d1d1d1d1d1d1d1d1d1d1d1d1d1d1d0',
    'd0w1w1w1d2d2d2w1w1w1d2w1w1w1d3d0',
    'd0w1d2d2w1d2w1d2d2d2d2w1d2d3w1d0',
    'd0w1d2d2w1d2w1d2d2d2d2w1d2d3w1d0',
    'd0w1w1w1d2d2d2w1w1d2d2w1d3d3w1d0',
    'd0w1d2d2d2d2d2d2d2w1d3w1d3d3w1d0',
    'd0w1d2d2d2d2d2d2d2w1d3w1d3d3w1d0',
    'd0w1d2d2d2d3d2w1w1w1d3w1w1w1d3d0',
    'd0d3d3d3d3d3d3d3d3d3d3d3d3d3d3d0',
    'd0d3x2x2x2x2x2x2x2x2x2x2x2x2d3d0',
    '..d0d0d0d0d0d0d0d0d0d0d0d0d0d0..',
    '................................',
    '................................',
  ],

  // Points. The engraved star is cut in tone 0, two steps from the base, because on the first
  // shaded attempt it was drawn in the neighbouring tone and the shadow swallowed it whole.
  coin: [
    '................................',
    '..........g0g0g0g0g0g0..........',
    '......g0g0g1g1g1g1g2g2g0g0......',
    '....g0g1g1g1g1g1g2g2g2g3g3g0....',
    '..g0g1g1g1g1g2g2g2g2g2g3g3g3g0..',
    '..g0g1g1g2g2g2g2g2g2g2g3g3g3g0..',
    'g0g1g1g2g2g2g2g2g2g2g2g2g3g3g3g0',
    'g0g1g2g2g2g2g2g0g0g2g2g3g3g3g3g0',
    'g0g1g2g2g2g2g0g0g0g0g2g3g3g3g3g0',
    'g0g1g2g2g2g2g2g0g0g2g2g3g3g3g3g0',
    '..g0g2g2g2g2g2g2g2g3g3g3g3g4g0..',
    '..g0g2g2g2g2g2g3g3g3g3g3g4g4g0..',
    '....g0g2g2g2g3g3g3g3g4g4g4g0....',
    '......g0g0g3g3g3g3g4g4g0g0......',
    '..........g0g0g0g0g0g0..........',
    '................................',
  ],

  // Leaderboard cup, with the handles a step darker so they read as behind the bowl.
  trophy: [
    '................................',
    '....g0g0g0g0g0g0g0g0g0g0g0g0....',
    '....g0g1g1g1g1g1g1g2g2g2g3g0....',
    'g0g0g0g1g1g1g1g2g2g2g2g3g0g0g0..',
    'g0g3g0g1g1g1g2g2g2g2g3g3g0g3g0..',
    'g0g3g0g1g1g2g2g0g0g2g3g3g0g3g0..',
    'g0g3g0g1g2g2g2g2g2g3g3g3g0g3g0..',
    'g0g0g0g2g2g2g2g2g3g3g3g3g0g0g0..',
    '....g0g0g2g2g2g2g3g3g3g0g0......',
    '........g0g2g2g2g3g3g0..........',
    '..........g0g2g3g3g0............',
    '..........g0g2g3g3g0............',
    '......g0g0g0g2g3g3g0g0g0........',
    '....g0g3g3g3g3g3g3g4g4g4g0......',
    '....g0g0g0g0g0g0g0g0g0g0g0......',
    '................................',
  ],

  // Team pennant on a wooden staff, planted in sand.
  flag: [
    '................................',
    '......r0r0r0r0r0r0r0r0r0........',
    '......r0r1r1r1r1r1r2r2r0........',
    '....r0r0r1r1r1r1r2r2r0..........',
    '....t0r0r1r1r1r2r2r0............',
    '....t0r0r1r1r2r0................',
    '....t0r0r0r0....................',
    '....t0t2t0......................',
    '....t0t2t0......................',
    '....t0t2t0......................',
    '....t0t2t0......................',
    '....t0t3t0......................',
    '..t0t0t3t0t0....................',
    's0s1s1s2s2s3s0..................',
    '................................',
    '................................',
  ],

  // Speech bubble for the team chat room (ADR-063), which has had no motif since it shipped.
  chat: [
    '................................',
    '..w0w0w0w0w0w0w0w0w0w0w0w0w0w0..',
    '..w0w1w1w1w1w1w1w1w1w1w1w1w2w0..',
    '..w0w1k2k2k2k2k2k2k2k2w2w2w2w0..',
    '..w0w1w1w1w1w1w1w1w1w1w2w2w2w0..',
    '..w0w1k2k2k2k2k2k2w2w2w2w3w3w0..',
    '..w0w1w1w1w1w1w1w2w2w2w3w3w3w0..',
    '..w0w1k2k2k2k2k2w2w2w3w3w3w3w0..',
    '..w0w2w2w2w2w2w2w3w3w3w3w3w3w0..',
    '..w0w2w2w2w0w0w0w0w0w0w0w0w0w0..',
    '..w0w2w2w3w0....................',
    '..w0w2w3w0......................',
    '..w0w0w0........................',
    '................................',
    '................................',
    '................................',
  ],

  // Captain's crown. The crimson jewels are two ramps away from the gold on purpose: an
  // adjacent tone would be swallowed at 20px, which is how a shaded coin lost its star.
  crown: [
    '................................',
    '................................',
    '................................',
    '................................',
    '..g0g1g1g0..g0g1g1g0..g0g1g1g0..',
    '..g0g1g2g0..g0g1g2g0..g0g1g2g0..',
    '..g0g1g1g2g1g1g1g2g1g1g1g2g2g0..',
    '..g0g2g2g2g2g2g2g2g2g2g2g3g3g0..',
    '..g0g1g2g2g2g2g2g2g2g2g3g3g3g0..',
    '..g0g2g2x2g2g2g2x2g2g2g2x2g3g0..',
    '..g0g2g2g2g2g2g2g2g2g3g3g3g3g0..',
    '..g0g3g3g3g3g3g3g3g3g3g4g4g4g0..',
    '..g0g0g0g0g0g0g0g0g0g0g0g0g0g0..',
    '................................',
    '................................',
    '................................',
  ],

  // Marker cone for a fringe station. Two retroreflective bands, lit from the upper left.
  cone: [
    '................................',
    '................................',
    '..............o0o0..............',
    '............o0o1o1o0............',
    '............o0o1o2o0............',
    '..........o0o1o1o2o2o0..........',
    '..........o0w1w1w1w1o0..........',
    '........o0w1w1w2w2w2w3o0........',
    '........o0o1o1o2o2o2o3o0........',
    '......o0o1o1o2o2o2o3o3o3o0......',
    '......o0w1w1w1w2w2w2w3w3o0......',
    '....o0o1o1o2o2o2o2o3o3o3o3o0....',
    '....o0o2o2o2o2o2o3o3o3o3o4o0....',
    '..o0o3o3o3o3o3o3o4o4o4o4o4o4o0..',
    '..o0o0o0o0o0o0o0o0o0o0o0o0o0o0..',
    '................................',
  ],

  /*
   * Hydration. A beach day in Singapore makes this a safety icon, not a garnish.
   *
   * The bottle is translucent plastic — a steel shell with water inside — rather than a solid
   * blue object. Drawn solid blue it all but disappeared against the sea background, which is
   * what the sheet's three fields are for. Clear plastic is also what a real bottle looks like.
   */
  waterbottle: [
    '................................',
    '............c0c1c1c0............',
    '............c0c2c3c0............',
    '..........c0c1c2c2c3c0..........',
    '........c0c1c2c2c2c3c3c0........',
    '........c0c1b1b2b2b3c3c0........',
    '........c0c1b1b2b2b3c3c0........',
    '........c0c1w1w1w1w2c3c0........',
    '........c0c1w1k2k2w2c3c0........',
    '........c0c1w1w1w1w2c3c0........',
    '........c0c1b1b2b2b3c3c0........',
    '........c0c1b2b2b3b3c3c0........',
    '........c0c1b2b3b3b4c3c0........',
    '........c0c0c0c0c0c0c0c0........',
    '................................',
    '................................',
  ],

  // Bell with an alert dot — the glyph companion to the unread LED on the chat tab.
  bellalert: [
    '................................',
    '........................r0r0r0..',
    '..............g0g0......r0r1r0..',
    '............g0g1g1g0....r0r0r0..',
    '..........g0g1g1g2g2g0..........',
    '........g0g1g1g2g2g2g3g0........',
    '........g0g1g2g2g2g2g3g0........',
    '......g0g1g1g2g2g2g2g3g3g0......',
    '......g0g1g2g2g2g2g2g3g3g0......',
    '....g0g1g1g2g2g2g2g2g3g3g3g0....',
    '....g0g2g2g2g2g2g2g3g3g3g4g0....',
    '..g0g0g0g0g0g0g0g0g0g0g0g0g0g0..',
    '............g0g3g3g0............',
    '..............g0g0..............',
    '................................',
    '................................',
  ],

  // Open crate for an empty state — "no teams yet". The interior is ink, two ramps below the
  // wood, so the opening still reads as a hole at 20px rather than as more crate.
  emptybox: [
    '................................',
    '................................',
    '................................',
    '................................',
    '....t0t1t1t0....t0t1t1t0........',
    '....t0t2t2t0....t0t2t2t0........',
    '....t0k3k3k3k3k3k3k3k3k3k3t0....',
    '....t0t1k3k3k3k3k3k3k3k3t3t0....',
    '....t0t1t2t2t2t2t2t2t3t3t3t0....',
    '....t0t1t2t2t2t2t2t2t3t3t3t0....',
    '....t0t1t2t2t2t2t2t2t3t3t3t0....',
    '....t0t1t2t2t2t2t2t2t3t3t4t0....',
    '....t0t2t2t2t2t2t2t3t3t3t4t0....',
    '....t0t0t0t0t0t0t0t0t0t0t0t0....',
    '................................',
    '................................',
  ],

  // Wet-weather contingency. The event has no glyph for "play is suspended" at all.
  raincloud: [
    '................................',
    '................................',
    '........c0c0c0c0c0..............',
    '......c0w1w1w1w1w2c0............',
    '....c0w1w1w1w1w2w2w3c0..........',
    '..c0w1w1w1w1w2w2w2w3w3c0........',
    '..c0w2w2w2w2w2w3w3w3w3w3c0......',
    '..c0c0c0c0c0c0c0c0c0c0c0c0......',
    '......b0......b0......b0........',
    '......b0b1....b0b1....b0b1......',
    '......b0b2....b0b2....b0b2......',
    '........b0......b0......b0......',
    '................................',
    '................................',
    '................................',
    '................................',
  ],

  /*
   * Referee whistle for a round opening and closing. Deliberately no lanyard: drawn with a cord
   * loop it read as a handbag, because the loop dominates the silhouette at this size. The air
   * hole is ink rather than the next steel tone, so it survives being scaled.
   */
  whistle: [
    '................................',
    '................................',
    '................................',
    '................................',
    '..............c0c0c0c0c0c0......',
    '..c0c0c0c0c0c0c1c1c2c2c2c3c0....',
    '..c0c1c1c1c1c1c2k3k3c2c3c3c0....',
    '..c0c0c0c0c0c1c2c2c2c3c3c4c0....',
    '..........c0c0c2c2c3c3c3c0......',
    '..............c0c0c0c0c0........',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
  ],

  // Volleyball net between two posts, for match and court surfaces.
  net: [
    '................................',
    '................................',
    '................................',
    '..c0c1....................c1c0..',
    '..c0c1k1k1k1k1k1k1k1k1k1k1c1c0..',
    '..c0c1k1..k1..k1..k1..k1..c1c0..',
    '..c0c1..k1..k1..k1..k1..k1c1c0..',
    '..c0c1k1..k1..k1..k1..k1..c1c0..',
    '..c0c1..k1..k1..k1..k1..k1c1c0..',
    '..c0c1k1k1k1k1k1k1k1k1k1k1c1c0..',
    '..c0c2....................c2c0..',
    '..c0c2....................c2c0..',
    '..c0c3....................c3c0..',
    '..c0c0....................c0c0..',
    '................................',
    '................................',
  ],

  // Per-match win, kept distinct from `trophy` and `coin` by the ribbon and the crimson centre.
  medal: [
    '................................',
    '....r0r1r0......r0r1r0..........',
    '......r0r1r0..r0r1r0............',
    '........r0r1r0r1r0..............',
    '..........r0r2r0................',
    '........g0g0g0g0g0..............',
    '......g0g1g1g1g2g2g0............',
    '....g0g1g1g2g2g2g3g3g0..........',
    '....g0g1g2x2x2x2g3g3g0..........',
    '....g0g1g2g2x2g2g3g3g0..........',
    '....g0g1g2g2g2g2g3g4g0..........',
    '......g0g2g2g2g3g3g0............',
    '........g0g0g0g0g0..............',
    '................................',
    '................................',
    '................................',
  ],

  /*
   * Bunting — a 24-wide repeating strip, the most "active day" border available. Three flags in
   * rotation so the repeat is not obvious at a glance. `wave` is the other tile of this kind.
   */
  bunting: [
    'k0k0k0k0k0k0k0k0k0k0k0k0k0k0k0k0k0k0k0k0k0k0k0k0',
    'r0r1r1r1r1r2r0..b0b1b1b1b1b2b0..g0g1g1g1g1g2g0..',
    '..r0r1r1r2r0......b0b1b1b2b0......g0g1g1g2g0....',
    '....r0r1r0..........b0b1b0..........g0g1g0......',
    '......r0..............b0..............g0........',
    '................................................',
  ],
};
