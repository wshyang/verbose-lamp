/**
 * ADR-193 — where each photoreal layer sits, in art units on the same 480x270 space the
 * classic backdrop uses.
 *
 * Only ONE dimension is given per sprite, plus an anchor. The other dimension is computed
 * from the finished file's measured aspect ratio, because a photoreal cut-out does not have
 * the aspect its hand-drawn counterpart had and forcing it into the old box would either
 * squash it or letterbox it. Deriving the box from the art is what keeps the two honest.
 *
 * Anchors: palms and players are anchored by their FEET (`bottom`), because that is the
 * thing that must stay on the sand when the art's proportions change. Gulls are anchored by
 * `top`, since nothing about a bird in the sky is load-bearing.
 */

/** Art space, unchanged from the classic — every percentage is against this. */
export const SCENE = { width: 480, height: 270 };

/** Full-width strips. `top` and `height` are art units; these tile or step in place. */
export const STRIPS = {
  clouds: { top: 0, height: 88, mode: 'luma', fade: 'bottom' },
  /*
   * ADR-195 — the near sea, lifted out so it can move on its own.
   *
   * `opaque` because unlike the clouds and the surf this was rendered as an ordinary
   * photograph, not as white-on-black, so there is no luminance to turn into alpha.
   *
   * It covers only the band between the sailboats and the shore. A layer spanning the whole
   * sea would have painted over the boats, and the near water is the only part where motion
   * is legible anyway — at the horizon a drifting texture reads as a rendering fault.
   * Fading both edges is what stops it being a rectangle of sea pasted on the sea.
   */
  water: { top: 156, height: 32, mode: 'opaque', fade: 'both' },
  waves: { top: 150, height: 46, mode: 'luma' },
  foam: { top: 186, height: 18, mode: 'luma' },
};

/**
 * Sprites placed by width alone (`backgroundSize: 'N% auto'`): the file's own aspect
 * decides the height, so these need no height at all. Positions are the classic's, which
 * still land correctly because the photoreal panorama was composed to match it.
 */
/**
 * ADR-198 — the periods the eight figures flip on.
 *
 * The pixel scene's four live in `pixelArt.ts`; these are separate rather than shared, both
 * because there are now eight and because the real scene borrowing the drawn scene's timing
 * was a dependency with no reason behind it. Non-harmonic on purpose: any two values with a
 * neat ratio drift into step after a few cycles and the court starts pulsing as one animal.
 */
export const PLAYER_PERIODS_REAL = [
  '0.72s', '0.94s', '0.83s', '1.12s', '0.67s', '1.03s', '0.88s', '1.21s',
];

/*
 * `previewX` is art units of horizontal offset applied ONLY by the flattened preview.
 *
 * Three cabins staggered by negative animation delay are genuinely spread along the cable
 * at runtime, but a still frame draws them all at t=0 and they land on top of each other —
 * so the one tool available for reviewing a scene that must not be wired in was reporting
 * one cable car where there are three. The offset makes the preview tell the truth about
 * the steady state; nothing ships it to the browser.
 */
/**
 * ADR-199 — which CSS class each part is drawn with.
 *
 * This lived in `<SentosaRealScene>` as a literal on every div. It had to come out the moment
 * a second thing needed to draw the same stack: the generated review page. Two hand-written
 * copies of a nineteen-layer z-order diverge the first time one of them is edited, and the
 * copy nobody runs tests against is the one that goes wrong. The class is data now, like the
 * cabin stagger before it, so the component and the review page cannot disagree.
 *
 * `__layer` fills the scene box and is positioned by `background-position`; `__frame` is an
 * explicit box. That distinction is the layer contract, not a style choice.
 */
export const CLASSES = {
  panorama: 'gb-scene__layer gb-scene__panorama',
  clouds: 'gb-scene__layer gb-scene__drift gb-scene__clouds',
  water: 'gb-scene__layer gb-scene__drift gb-scene__water',
  waves: 'gb-scene__layer gb-scene__drift gb-scene__waves',
  foam: 'gb-scene__layer gb-scene__foam',
  skyHelix: 'gb-scene__frame gb-scene__skyhelix',
  uss: 'gb-scene__frame gb-scene__uss',
  merlion: 'gb-scene__frame gb-scene__merlion',
  ferry: 'gb-scene__layer gb-scene__ferry',
  bumboat: 'gb-scene__layer gb-scene__ferry',
  cable: 'gb-scene__layer gb-scene__cable',
  cablecar: 'gb-scene__frame gb-scene__cablecar',
  cablecar2: 'gb-scene__frame gb-scene__cablecar',
  cablecar3: 'gb-scene__frame gb-scene__cablecar',
  guideway: 'gb-scene__frame gb-scene__guideway',
  express: 'gb-scene__layer gb-scene__express',
  ferryJetty: 'gb-scene__frame gb-scene__jetty',
  ferry2: 'gb-scene__frame gb-scene__moored',
  ferryTerminal: 'gb-scene__frame gb-scene__terminal',
  portal: 'gb-scene__layer gb-scene__portal',
  birds: 'gb-scene__frame gb-scene__gulls',
  umbrella: 'gb-scene__frame gb-scene__umbrella',
  deckchair: 'gb-scene__frame gb-scene__deckchair',
  net: 'gb-scene__frame gb-scene__net',
  ball: 'gb-scene__layer gb-scene__ball',
  palmLeft: 'gb-scene__frame gb-scene__palm',
  palmRight: 'gb-scene__frame gb-scene__palm',
};

/**
 * ADR-201 — the cable, and the cabins that hang from it.
 *
 * The wires used to be painted into the panorama and the cabins were positioned by eye
 * against them, which is why they were never quite on the line: two numbers tuned
 * separately, one of them inside a photograph that cannot be measured. **A sprite that has
 * to line up with a moving thing cannot live in the backdrop** — the same argument the net
 * and the ferry terminal were lifted out on, applied to a line one pixel wide.
 *
 * So the wires are painted out and the cable is drawn here instead, from these two points,
 * by the generator. The cabins hang from the same two points. They cannot disagree,
 * because neither is measured: both are this.
 *
 * `x0` is off the left edge on purpose — the line should arrive from Mount Faber rather
 * than begin at the frame — and the run ends in the island treeline, which is where the
 * painted one ended too.
 */
export const CABLE = { x0: -8, y0: 18, x1: 236, y1: 106, gap: 1.1 };

/**
 * Three different cabins, not one cabin three times (ADR-198). `at` is how far along the
 * cable each one sits in the steady state, which drives BOTH its animation delay and where
 * the flattened preview draws it — one number, so the still and the motion agree.
 */
export const CABLECARS = {
  cablecar: { artWidth: 15, at: 0, roster: 'cablecar' },
  cablecar2: { artWidth: 14, at: 1 / 3, roster: 'cablecar' },
  cablecar3: { artWidth: 15, at: 2 / 3, roster: 'cablecar' },
};

/** One trip along the wire, in seconds. The delays are fractions of it. */
export const CABLE_SECONDS = 33;

export const WIDTH_SPRITES = {
  // Express and portal are re-sited for the photoreal panorama: the drawn island and the
  // rendered one put their shoreline in different places, and the classic coordinates left
  // the train in open water with a shrub floating in front of it.
  /*
   * ADR-201 — the train had no track. It ran along the island shore on nothing, which the
   * eye forgives in pixel art and does not forgive in a photograph.
   *
   * `posY` now puts its wheels exactly on the guideway beam below, and the run is bounded
   * at both ends by something: it comes round the headland at x=190 and finishes hidden
   * behind the ferry terminal at x=330, passing behind the portal tree clump on the way.
   * A vehicle that starts and stops in open air is the same fault as one with no track.
   */
  express: { artWidth: 56, posX: 44.8, posY: 54 },
  portal: { artWidth: 50, posX: 59.3, posY: 49.2 },
  /*
   * ADR-196 — the sea had two sailboats painted into it and now has none, because a yacht
   * is not what you see off Siloso. A ferry is. It crosses the open water left of the
   * island and fades at both ends of its run: there is nothing out there to hide behind,
   * and a boat that pops into existence is worse than one that resolves out of the haze.
   */
  ferry: { artWidth: 28, posX: 10, posY: 52, roster: 'crossing', delay: '0s', duration: '74s', previewX: 0 },
  // A bumboat, because the channel is not all scheduled services. Smaller, slower and set
  // slightly lower in the frame, so the two boats differ in three ways at once rather than
  // being the same silhouette at two sizes.
  bumboat: { artWidth: 19, posX: 9, posY: 53, roster: 'crossing', delay: '-38s', duration: '96s', previewX: 60 },
  ball: { artWidth: 9, posX: 44, posY: 62 },
};

/**
 * Two-frame sheets, boxed to one frame. `drive` says which dimension is fixed; the other
 * follows the measured aspect.
 *
 * The palms are the one deliberate departure from the classic geometry. The hand-drawn
 * version was a 58x38 crown tucked into the bottom corners; the render is a whole tree, so
 * it is sized by height and stood on the sand as a foreground frame. Shrinking a tree into
 * a crown's box would have wasted the only two sprites with real depth in them.
 */
export const SHEETS = {
  birds: { drive: 'width', units: 11, left: 168, top: 44, anchor: 'top' },
  palmLeft: { drive: 'height', units: 104, left: -10, bottom: 268, anchor: 'bottom' },
  palmRight: { drive: 'height', units: 104, left: 392, bottom: 264, anchor: 'bottom' },
  // Far side: feet ABOVE the net's base line, and smaller, because they are further away.
  player1: { drive: 'height', units: 27, left: 216, bottom: 202, anchor: 'bottom', roster: 'playerFar' },
  player2: { drive: 'height', units: 25, left: 302, bottom: 205, anchor: 'bottom', roster: 'playerFar' },
  player5: { drive: 'height', units: 26, left: 178, bottom: 203, anchor: 'bottom', roster: 'playerFar' },
  player6: { drive: 'height', units: 24, left: 262, bottom: 206, anchor: 'bottom', roster: 'playerFar' },
  // Near side: feet BELOW it, and bigger. The size difference is doing as much work as the
  // occlusion is — two figures the same height either side of a net read as a sticker sheet.
  player3: { drive: 'height', units: 42, left: 178, bottom: 252, anchor: 'bottom', roster: 'playerNear' },
  player4: { drive: 'height', units: 44, left: 304, bottom: 258, anchor: 'bottom', roster: 'playerNear' },
  player7: { drive: 'height', units: 40, left: 124, bottom: 249, anchor: 'bottom', roster: 'playerNear' },
  player8: { drive: 'height', units: 43, left: 240, bottom: 255, anchor: 'bottom', roster: 'playerNear' },
};

/*
 * Figures all draw the same way, so their class is derived rather than listed. Writing
 * `player1` through `player8` out by hand here would have been the fourth hardcoded copy of
 * the player list, after the three ADR-198 removed from the generator.
 */
for (const [name, spec] of Object.entries(SHEETS)) {
  if (spec.roster?.startsWith('player')) {
    CLASSES[name] = 'gb-scene__frame gb-scene__player';
  }
}

/**
 * Single-frame sprites with an explicit box, for things that are placed rather than animated.
 *
 * The net is the whole reason this category exists. Baked into the panorama it could only ever
 * be *behind* every player, because the panorama is the bottom layer — so a figure on the far
 * side of the court stood in front of a net they are supposed to be behind, and the court read
 * as flat. Lifted out, the net becomes the thing that establishes depth: `far` players are
 * drawn under it, `near` players over it.
 *
 * The scene already worked this way once, in `portal` — a tree clump whose only job is to be in
 * front of the Express so the train can disappear behind it rather than blink out. The net is
 * the same idea applied to the court: an occluder is not decoration, it is the only way a flat
 * stack of layers acquires a front and a back.
 */
export const PLACED = {
  /*
   * ADR-195 — the landmarks, out of the backdrop.
   *
   * None of these are occluders the way the net is; nothing passes behind the Merlion. They
   * are split for a different reason: while they were painted into the panorama, the only
   * way to move the Merlion a few metres, re-time the sea, or put a chair somewhere else was
   * to re-render the entire backdrop and re-tune every other layer against it. Separated,
   * each is a line of geometry. The cost of the split is paid once; the cost of NOT splitting
   * is paid at every future edit.
   *
   * Heights are given for all four. Each render frames its subject with its own margins, so
   * the measured aspect describes the photograph rather than the object, and a pier that is
   * twice as tall as it should be is worse than a pier whose roofs are slightly flattened.
   */
  merlion: { left: 16, width: 78, height: 50, bottom: 172, anchor: 'bottom' },
  /*
   * ADR-196 — the jetty and the terminal are two different things, and calling the jetty a
   * terminal was the bug. A pier is the structure you walk along; the terminal is the
   * building you walk through to reach it. The scene had only the first.
   *
   * The terminal is drawn AFTER the Express, which makes it the scene's second occluder
   * (the portal tree clump was the first): the train runs along the island shore and passes
   * behind it, so it leaves the frame by going somewhere rather than by switching off.
   */
  /*
   * ADR-201 — the guideway, drawn before the Express so the train sits on it.
   *
   * It runs off the right edge of the frame on purpose. The beam sits slightly lower than
   * the terminal's footings, so the building cannot hide its end, and a viaduct that simply
   * stops in open water is a worse fault than the missing track it was added to fix. Off
   * the edge it has no end to be wrong about; the jetty covers the last stretch.
   */
  guideway: { left: 182, width: 298, height: 15, bottom: 167, anchor: 'bottom' },
  /*
   * ADR-201 — the jetty now overlaps the terminal rather than floating beside it. A pier
   * detached from its building is a jetty to nowhere; drawn first and tucked under the
   * terminal's right edge, it reads as running out from behind it.
   */
  ferryJetty: { left: 372, width: 108, height: 32, bottom: 170, anchor: 'bottom' },
  /*
   * ADR-197 — the real building, and the biggest single element in the scene.
   *
   * Lee Coo's 1987 terminal: a central rotunda ringed with white columns under spreading
   * orange tile, and a 32-metre clock tower on top of it. It is deliberately large. In
   * every photograph of 1990s Sentosa it dominates the shoreline, and a polite little
   * building tucked into the treeline would be the same mistake as before in a new size.
   */
  ferryTerminal: { left: 300, width: 100, height: 50, bottom: 147, anchor: 'bottom' },
  // Same artwork as the moving ferry, flopped and tied up alongside the pier. One render,
  // two boats: 'ferries' is a plural, and a terminal with nothing berthed at it reads shut.
  // Was the crossing ferry flopped. A second real vessel instead: the point of a berth is
  // that something different is tied up at it.
  ferry2: { left: 392, width: 58, height: 19, bottom: 174, anchor: 'bottom', roster: 'moored' },
  /*
   * The two landmarks that say Sentosa rather than generic-tropical-island. They stand in
   * the island's treeline, left of the clock tower and clear of the Express's run. The
   * white geodesic dome that used to sit on the right of the panorama belonged to no real
   * place on the island and has been painted out in favour of more jungle.
   */
  /*
   * ADR-214 — the monument, not the egg. The globe is a SPHERE inside a ring of freestanding
   * gold letters standing in a pool, so the silhouette is landscape (1.3) where the old
   * egg-on-a-pedestal was portrait (0.81). The box is sized so the SPHERE keeps the apparent
   * diameter it had before: the thing beside it in the treeline should not suddenly grow.
   */
  uss: { left: 198, width: 23, height: 18, bottom: 152, anchor: 'bottom' },
  /*
   * ADR-213 — SkyHelix, not the Tiger Sky Tower, which was dismantled after closing on
   * 28 December 2018. The box is the real ride: 79 m against the old tower's 131 m, so the
   * height drops 54 -> 33, and a 12 m gondola on a 79 m mast is 0.15 wide against the old
   * disc-on-a-column's 0.22, so the width drops 12 -> 5. It stands on the same centre line
   * (250) and the same ground line (150) as the thing it replaces.
   */
  skyHelix: { left: 248, width: 5, height: 33, bottom: 150, anchor: 'bottom' },
  umbrella: { left: 50, width: 46, height: 44, bottom: 206, anchor: 'bottom' },
  deckchair: { left: 92, width: 34, height: 26, bottom: 208, anchor: 'bottom' },
  /*
   * Height is given rather than derived, which is the one place this file overrides the
   * measured art. The render frames the net with a generous length of post above and below
   * the mesh, so its natural aspect is 1.83 where a real 8m net on 2.8m posts is nearer 2.9.
   * Left to the measurement the net stood four metres tall and reached the island. Forcing
   * the box squashes the mesh squares into slightly wide rectangles, which at this size is
   * invisible, where the wrong height was not.
   */
  net: { left: 168, width: 172, height: 60, bottom: 224, anchor: 'bottom' },
};

/** Percentage of the scene box, to the same 3 decimals the classic generator emits. */
export function pct(value, total) {
  return `${Number(((value / total) * 100).toFixed(3))}%`;
}
