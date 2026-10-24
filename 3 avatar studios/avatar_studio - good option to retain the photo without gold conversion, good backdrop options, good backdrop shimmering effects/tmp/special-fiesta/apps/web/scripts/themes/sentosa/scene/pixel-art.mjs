import { Canvas, ditherBand , outlineCanvas, stampCanvas } from '../../../pixel-canvas.mjs';
import { scatter } from '../../../scene/scatter.mjs';

/**
 * The Sentosa panorama (ADR-022), drawn from images/ingest/sentosa_backdrop.jpeg:
 * CBD skyline and VivoCity across the water, the Merlion on its knoll, the resort's
 * terracotta roofs and clock tower, a pier pavilion on stilts, the Universal globe,
 * coaster track, the cable-car span, the Sentosa Express, then the bay and the beach
 * volleyball court.
 *
 * Art is 480×270 and every coordinate below is in those units. The layout deliberately
 * keeps landmarks away from the horizontal middle: on desktop the participant's phone
 * column sits there and would hide them.
 */
export const W = 480;
export const H = 270;
const HORIZON = 150;

export const P = {
  ink: '#12243a',
  skyTop: '#5fb8ec',
  skyMid: '#8ed2f6',
  skyLow: '#bbe4fb',
  skyHaze: '#e6f4fd',
  sunCore: '#fffbe4',
  sunGlow: '#ffeeb0',
  cloud: '#ffffff',
  cloudShade: '#d7eefc',
  cityFar: '#a8c0d6',
  cityMid: '#8da8c2',
  cityDark: '#7590ac',
  window: '#dcefff',
  wall: '#f2eee1',
  wallShade: '#d6cfba',
  roof: '#c4532d',
  roofDark: '#9a3c1f',
  green: '#2f8250',
  greenDark: '#1e5937',
  greenLight: '#4aa866',
  trunk: '#7a4a24',
  trunkDark: '#563318',
  stone: '#efe9da',
  stoneShade: '#cfc6ad',
  stoneDark: '#a99c80',
  stoneLine: '#7a6f58',
  steel: '#cbd8e6',
  steelDark: '#6d8295',
  glass: '#9fd6ff',
  seaFar: '#2f7dd1',
  seaMid: '#3aa1db',
  seaNear: '#58c6e1',
  seaShore: '#93dfea',
  foam: '#ecfbff',
  sandWet: '#d9c193',
  sand: '#f3e4bd',
  sandWarm: '#ecd9ab',
  sandDark: '#e2ca97',
  sandLight: '#faf1d8',
  court: '#2f7dd1',
  rock: '#8d8476',
  rockDark: '#5f594f',
  red: '#e8483f',
  gold: '#ffc72c',
  white: '#ffffff',
};

// `scatter` moved to scripts/scene/scatter.mjs (ADR-298); re-exported so Sentosa's sprites still import it from here.
export { scatter };

/** Water's edge: a shallow bay curve, so the beach is not a ruled line. */
export function shoreY(x) {
  const t = x / W;
  return Math.round(196 - 8 * Math.sin(Math.PI * t) + 4 * t);
}

/**
 * Cable-car span, shared by the art and the generated anchors. It runs off frame at both
 * ends: a cable that stops in mid-air over the bay defies physics.
 */
export const CABLE = { x0: -24, y0: 84, x1: 504, y1: 16 };
export const CABLE_Y = (x) => CABLE.y0 + ((x - CABLE.x0) / (CABLE.x1 - CABLE.x0)) * (CABLE.y1 - CABLE.y0);
/** Express beam: the train emerges from the trees on the left and leaves frame right. */
export const RAIL = { x0: 286, x1: W, y: 139 };
export const NET = { x0: 322, x1: 462, top: 200, base: 236 };

function sky(c) {
  ditherBand(c, 0, 46, P.skyTop, P.skyMid);
  ditherBand(c, 46, 96, P.skyMid, P.skyLow);
  ditherBand(c, 96, 132, P.skyLow, P.skyHaze);
  c.rect(0, 132, W, HORIZON - 132, P.skyHaze);
  // Sun glare, upper left, matching the reference photo's blown-out corner.
  // Dithered halo, not a translucent disc: the panorama layer must stay fully opaque.
  for (let y = -19; y <= 19; y += 1) {
    for (let x = -19; x <= 19; x += 1) {
      const d = Math.sqrt(x * x + y * y);
      if (d > 19 || d < 14) continue;
      if ((x + y) % 2 === 0) c.set(58 + x, 34 + y, P.sunGlow);
    }
  }
  c.disc(58, 34, 14, P.sunGlow);
  c.disc(58, 34, 11, P.sunCore);
  c.disc(58, 34, 7, P.white);
}

function tower(c, x, top, width, shade) {
  c.rect(x, top, width, HORIZON - top, shade);
  c.vLine(x, top, HORIZON, P.cityDark);
  c.hLine(x, x + width - 1, top, P.window);
  for (let y = top + 3; y < HORIZON - 2; y += 4) {
    for (let wx = x + 1; wx < x + width - 1; wx += 3) c.set(wx, y, P.window);
  }
}

/** Mainland: the CBD stack, then HarbourFront and VivoCity's white roofline. */
function city(c) {
  tower(c, 2, 120, 8, P.cityFar);
  tower(c, 11, 106, 10, P.cityMid);
  c.rect(14, 98, 3, 8, P.cityMid);
  tower(c, 22, 114, 7, P.cityFar);
  tower(c, 30, 102, 11, P.cityDark);
  tower(c, 42, 118, 9, P.cityMid);
  tower(c, 52, 110, 8, P.cityFar);
  tower(c, 61, 122, 11, P.cityMid);
  tower(c, 73, 112, 7, P.cityDark);
  c.vLine(76, 104, 112, P.cityDark);
  // VivoCity: long white shed with a wavy roof and a gold sign.
  c.rect(80, 134, 34, 16, P.wall);
  c.rect(80, 146, 34, 4, P.wallShade);
  for (let x = 80; x < 114; x += 1) c.set(x, 133 - (x % 4 === 0 ? 1 : 0), P.white);
  c.hLine(88, 100, 139, P.gold);
  c.rect(114, 138, 10, 12, P.cityFar);
}

function treeLine(c, x0, x1, ridge) {
  const rand = scatter(x0 * 977 + 13);
  for (let x = x0; x <= x1; x += 1) {
    const y = ridge(x);
    c.vLine(x, y, HORIZON + 2, P.green);
  }
  // Canopy: light clumps catch the sun, dark ones sit in the gullies.
  const step = 2 / c.scale;
  for (let x = x0; x <= x1; x += step) {
    const y = ridge(x) + Math.round(rand() * 3);
    c.disc(x, y, 2, rand() < 0.4 ? P.greenLight : P.green);
    c.disc(x + 1, y + 3, 2, P.greenDark);
  }
  for (let i = 0; i < c.density((x1 - x0) / 3); i += 1) {
    const x = x0 + Math.floor(rand() * (x1 - x0));
    const y = ridge(x) + 4 + Math.floor(rand() * (HORIZON - ridge(x) - 6));
    c.disc(x, y, 1 + Math.floor(rand() * 2), rand() < 0.5 ? P.greenDark : P.greenLight);
  }
  // A few palm heads breaking the ridge, so it is not one smooth hedge.
  for (let x = x0 + 12; x < x1 - 8; x += 38) {
    const y = ridge(x) - 7;
    c.vLine(x, y, y + 9, P.trunkDark);
    c.vLine(x + 1, y + 2, y + 9, P.trunk);
    for (const [dx, dy] of [[-6, 0], [6, 0], [-5, 3], [5, 3], [-2, -3], [2, -3]]) {
      c.line(x, y, x + dx, y + dy, P.greenDark);
      c.line(x, y - 1, x + dx, y + dy - 1, P.green);
    }
    c.disc(x, y, 1, P.greenDark);
  }
}

/**
 * The Merlion, drawn as row spans rather than an ASCII grid: at 20×31 the silhouette is
 * what carries it — maned head, scaled body, flared tail — so the spans are easier to
 * tune than counting dots.
 */
/**
 * The Merlion, side profile, facing the bay — drawn from images/ingest/merlion.jpg.
 *
 * What makes the statue read at this size, in order: the mane is a ring of big ROUNDED
 * lobes, not spikes (spikes make a dragon); the head is held high on a thick chest; the
 * mouth is wide open with the jet leaving it horizontally; the body is a fish body,
 * heavier than the head, covered in crescent scales and curling to a tail fin; and it
 * rises out of a blue-green wave, not a plinth.
 */
const MERLION = { x: 100, y: 80, w: 52, h: 52, headX: 26, headY: 13, headR: 8 };

/**
 * Mane lobes: [dx, dy] from the head centre. Small, rounded and regular — in the photo the
 * mane is a ring of petals about a third of the head across. Bigger lobes turn the statue
 * into a poodle; pointed ones turn it into a dragon.
 */
const MANE_LOBES = [
  [7, -9], [2, -12], [-4, -11], [-9, -7], [-12, -2], [-12, 4], [-9, 9], [-3, 12], [4, 12],
];

/** Body spans `[from, to]`, two rows each, from the chest down into the tail base. */
const MERLION_BODY = [
  [18, 33], [16, 34], [13, 35], [11, 35], [9, 34], [8, 33], [7, 31], [7, 29], [8, 27], [10, 25],
];

function merlionHead(c) {
  const { headX, headY, headR } = MERLION;
  for (const [dx, dy] of MANE_LOBES) {
    c.disc(headX + dx, headY + dy, 4, P.stoneDark);
    c.disc(headX + dx, headY + dy, 3, P.stone);
    c.set(headX + dx, headY + dy, P.stoneShade);
  }
  for (const dx of [-5, 1]) c.disc(headX + dx, headY - 8, 2, P.stone);
  c.disc(headX, headY, headR, P.stone);
  // Muzzle: short and blunt, with a jaw carried under the open mouth.
  c.rect(headX + 4, headY - 5, 10, 11, P.stone);
  c.disc(headX + 13, headY - 1, 3, P.stone);
  c.hLine(headX + 1, headX + 10, headY - 5, P.stoneShade);
  c.rect(headX + 5, headY - 3, 2, 2, P.ink);
  c.set(headX + 7, headY - 3, P.white);
  c.rect(headX + 13, headY - 3, 3, 2, P.stoneDark);
  c.rect(headX + 9, headY, 7, 3, '#2c3e56');
  c.hLine(headX + 8, headX + 15, headY + 3, P.stoneDark);
  c.hLine(headX + 3, headX + 13, headY + 5, P.stoneShade);
}

function merlionBody(c) {
  MERLION_BODY.forEach(([from, to], i) => c.rect(from, 22 + i * 2, to - from + 1, 2, P.stone));
  // Crescent scales, staggered like roof tiles and kept off the outline.
  for (let row = 0; row < 8; row += 1) {
    const y = 25 + row * 2;
    for (let x = 12 + (row % 2) * 4; x < 32 - row * 2; x += 7) {
      c.curve([x, y], [x + 2, y + 2], [x + 4, y], P.stoneDark);
    }
  }
  // Pectoral fin against the chest.
  c.triangle([[27, 25], [34, 32], [25, 33]], P.stoneShade);
  c.triangle([[27, 26], [31, 31], [26, 32]], P.stoneDark);
  // The tail sweeps left out of the body and flicks up into a two-pointed fluke.
  c.curve([14, 39], [4, 43], [-1, 37], P.stone);
  c.curve([14, 41], [5, 45], [1, 38], P.stone);
  c.triangle([[-1, 37], [-9, 25], [4, 34]], P.stone);
  c.triangle([[-1, 37], [-5, 27], [3, 35]], P.stoneShade);
  c.triangle([[-2, 36], [-12, 33], [1, 40]], P.stone);
  c.triangle([[-2, 37], [-8, 35], [0, 40]], P.stoneShade);
}

function merlion(c) {
  const statue = new Canvas(MERLION.w, MERLION.h, c.scale);
  merlionBody(statue);
  merlionHead(statue);
  outlineCanvas(statue, P.stoneLine);
  stampCanvas(c, statue, MERLION.x, MERLION.y);
  const [ox, oy] = [MERLION.x, MERLION.y];
  // The wave the statue rises out of: a low teal band with white crests.
  c.rect(ox - 6, oy + 43, 44, 3, P.seaMid);
  for (const dx of [-4, 4, 13, 22, 30]) {
    c.disc(ox + dx, oy + 43, 3, P.seaNear);
    c.disc(ox + dx + 1, oy + 42, 2, P.white);
  }
  // Terrace, with the statue's shadow falling across it.
  c.rect(ox - 10, oy + 46, 52, 3, P.stone);
  c.hLine(ox, ox + 28, oy + 46, P.stoneShade);
  c.rect(ox - 10, oy + 48, 52, 2, P.stoneShade);
  c.rect(ox - 14, oy + 50, 60, 2, P.wallShade);
  // Water arcing from the mouth into the bay.
  c.curve([ox + 43, oy + 14], [ox + 55, oy + 14], [ox + 65, oy + 47], P.foam);
  c.curve([ox + 43, oy + 15], [ox + 55, oy + 16], [ox + 64, oy + 47], P.white);
  c.disc(ox + 65, oy + 48, 2, P.foam);
}

function pavilion(c, x, y, width) {
  const half = Math.floor(width / 2);
  c.triangle([[x - 1, y + 6], [x + half, y - 2], [x + width, y + 6]], P.roof);
  c.hLine(x - 1, x + width, y + 6, P.roofDark);
  c.rect(x + 1, y + 7, width - 2, 8, P.wall);
  c.rect(x + 1, y + 13, width - 2, 2, P.wallShade);
  for (let wx = x + 2; wx < x + width - 2; wx += 3) c.vLine(wx, y + 8, y + 12, P.glass);
  // Stilts into the water.
  for (let sx = x + 2; sx < x + width - 1; sx += 4) c.vLine(sx, y + 15, y + 22, P.wallShade);
}

/** Resort block: two terracotta wings, a colonnade and the clock tower. */
function resort(c) {
  c.rect(300, 126, 74, 24, P.wall);
  c.rect(300, 144, 74, 6, P.wallShade);
  c.triangle([[296, 127], [337, 116], [378, 127]], P.roof);
  c.hLine(296, 378, 127, P.roofDark);
  c.rect(303, 118, 68, 3, P.roof);
  for (let x = 304; x < 372; x += 5) {
    c.vLine(x, 131, 143, P.glass);
    c.vLine(x + 1, 131, 143, P.wallShade);
  }
  // Clock tower.
  c.rect(330, 96, 14, 32, P.wall);
  c.rect(330, 96, 14, 2, P.wallShade);
  c.triangle([[328, 97], [337, 86], [346, 97]], P.roof);
  c.disc(337, 104, 4, P.white);
  c.ring(337, 104, 4, P.ink);
  c.set(337, 104, P.ink);
  c.vLine(337, 101, 104, P.ink);
  c.hLine(337, 340, 104, P.ink);
  c.rect(374, 132, 30, 18, P.wall);
  c.triangle([[371, 133], [389, 124], [407, 133]], P.roof);
  c.hLine(371, 407, 133, P.roofDark);
}

/** Universal Studios globe on the hill: ring, meridians and the lettering band. */
function globe(c) {
  const [cx, cy, r] = [444, 100, 15];
  c.disc(cx, cy, r, P.seaFar);
  c.ring(cx, cy, r, P.steelDark);
  for (const dy of [-9, -4, 4, 9]) {
    const half = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
    c.hLine(cx - half, cx + half, cy + dy, P.glass);
  }
  for (const dx of [-8, 0, 8]) {
    const half = Math.round(Math.sqrt(Math.max(0, r * r - dx * dx)));
    c.vLine(cx + dx, cy - half, cy + half, P.glass);
  }
  c.rect(cx - r, cy - 2, r * 2 + 1, 5, P.white);
  c.hLine(cx - r, cx + r, cy - 2, P.steelDark);
  c.hLine(cx - r, cx + r, cy + 2, P.steelDark);
  for (let x = cx - 12; x <= cx + 11; x += 3) c.vLine(x, cy - 1, cy + 1, P.cityDark);
  c.rect(cx - 3, cy + r, 7, 8, P.steelDark);
}

/** Roller coaster: a rising hill, a vertical loop and a red racing rail. */
/** Roller coaster: laddered rails, a vertical loop and a train mid-drop. */
function coaster(c) {
  const support = (x, top) => {
    c.vLine(x, top, 124, P.steelDark);
    c.line(x, top + 6, x + 6, top + 14, P.steelDark);
  };
  for (const x of [384, 398, 412, 424]) support(x, 106);
  for (const x of [358, 370, 382]) support(x, 110);
  const rail = (dy, colour) => c.curve([376, 120 + dy], [400, 74 + dy], [428, 112 + dy], colour, 220);
  rail(2, P.roofDark);
  rail(0, P.red);
  for (let t = 0; t <= 1.0001; t += 0.06) {
    const x = (1 - t) * (1 - t) * 376 + 2 * (1 - t) * t * 400 + t * t * 428;
    const y = (1 - t) * (1 - t) * 120 + 2 * (1 - t) * t * 74 + t * t * 112;
    c.vLine(Math.round(x), Math.round(y), Math.round(y) + 2, P.steelDark);
  }
  c.ring(401, 99, 11, P.seaFar, 2);
  c.ring(401, 99, 12, '#1d4f86', 1);
  const second = (dy, colour) => c.curve([352, 126 + dy], [372, 94 + dy], [394, 120 + dy], colour, 180);
  second(2, '#c08f10');
  second(0, P.gold);
  for (let t = 0; t <= 1.0001; t += 0.08) {
    const x = (1 - t) * (1 - t) * 352 + 2 * (1 - t) * t * 372 + t * t * 394;
    const y = (1 - t) * (1 - t) * 126 + 2 * (1 - t) * t * 94 + t * t * 120;
    c.vLine(Math.round(x), Math.round(y), Math.round(y) + 2, P.steelDark);
  }
  // Three cars cresting the first hill.
  for (let i = 0; i < 3; i += 1) {
    const t = 0.42 + i * 0.07;
    const x = Math.round((1 - t) * (1 - t) * 376 + 2 * (1 - t) * t * 400 + t * t * 428);
    const y = Math.round((1 - t) * (1 - t) * 120 + 2 * (1 - t) * t * 74 + t * t * 112);
    c.rect(x - 2, y - 4, 5, 4, i === 0 ? P.gold : P.white);
    c.set(x - 2, y - 4, P.ink);
    c.set(x + 2, y - 4, P.ink);
  }
  c.line(428, 112, 442, 122, P.red);
}

/** Cable-car span from the mainland, with a pylon planted on the ridge. */
function cableway(c) {
  c.line(CABLE.x0, CABLE.y0, CABLE.x1, CABLE.y1, P.steelDark);
  c.line(CABLE.x0, CABLE.y0 + 5, CABLE.x1, CABLE.y1 + 5, P.steelDark);
  const px = 266;
  const top = Math.round(CABLE_Y(px)) - 5;
  c.vLine(px, top, 128, P.steelDark);
  c.vLine(px + 1, top, 128, P.steel);
  c.hLine(px - 8, px + 9, top + 2, P.steelDark);
  c.hLine(px - 6, px + 7, top + 5, P.steel);
  c.line(px - 7, 128, px, top + 6, P.steelDark);
  c.line(px + 8, 128, px + 1, top + 6, P.steelDark);
  // Lattice rungs, so the mast reads as a cable-car pylon and not an aerial.
  for (let y = top + 10; y < 126; y += 6) {
    const spread = Math.round(1 + ((y - top) / (126 - top)) * 6);
    c.hLine(px - spread, px + spread + 1, y, P.steelDark);
    c.line(px - spread, y, px + spread + 1, y + 6, '#9fb0bd');
  }
}

/** Elevated Sentosa Express beam, on piers, in front of the resort. */
function railway(c) {
  for (let x = RAIL.x0 + 10; x < W; x += 22) {
    c.rect(x, RAIL.y + 4, 3, HORIZON - RAIL.y - 2, P.steelDark);
    c.vLine(x, RAIL.y + 4, HORIZON + 1, P.steel);
    c.hLine(x - 2, x + 4, RAIL.y + 4, P.steelDark);
  }
  c.hLine(RAIL.x0, W, RAIL.y, P.white);
  c.hLine(RAIL.x0, W, RAIL.y + 1, P.steel);
  c.hLine(RAIL.x0, W, RAIL.y + 2, P.steelDark);
  c.hLine(RAIL.x0, W, RAIL.y + 3, '#54697a');
}

function sea(c) {
  ditherBand(c, HORIZON, 162, P.seaFar, P.seaMid);
  ditherBand(c, 162, 178, P.seaMid, P.seaNear);
  ditherBand(c, 178, 192, P.seaNear, P.seaShore);
  for (let x = 0; x < W; x += 1) {
    for (let y = 192; y < shoreY(x); y += 1) c.set(x, y, P.seaShore);
  }
  // Baked swell: short highlight dashes that the animated layer moves over.
  const rand = scatter(0x5ea0);
  for (let i = 0; i < c.density(90); i += 1) {
    const x = Math.floor(rand() * W);
    const y = HORIZON + 3 + Math.floor(rand() * 38);
    c.hLine(x, x + 1 + Math.floor(rand() * 3), y, rand() < 0.25 ? P.white : P.foam);
  }
  // Float line across the swimming bay.
  for (let x = 150; x < 300; x += 9) c.set(x, 168, P.gold);
}

function rocks(c) {
  for (let i = 0; i < 26; i += 1) {
    const x = i * 3;
    const y = 146 + ((i * 11) % 5);
    c.disc(x, y, 3 + (i % 2), P.rock);
    c.disc(x - 1, y - 1, 1 + (i % 2), P.rockDark);
  }
  c.rect(0, 150, 72, 4, P.rockDark);
}

function sailboat(c, x, y) {
  c.triangle([[x, y - 12], [x, y - 1], [x - 8, y - 1]], P.white);
  c.triangle([[x + 1, y - 9], [x + 1, y - 1], [x + 6, y - 1]], P.cloudShade);
  c.vLine(x, y - 12, y, P.ink);
  c.hLine(x - 9, x + 7, y, P.ink);
  c.hLine(x - 7, x + 5, y + 1, P.wall);
  c.hLine(x - 6, x + 4, y + 2, P.seaFar);
}

export function drawPalmTrunk(c, baseX, baseY, height, lean) {
  const topX = baseX + lean;
  const topY = baseY - height;
  for (let i = 0; i <= 60; i += 1) {
    const t = i / 60;
    const x = (1 - t) * (1 - t) * baseX + 2 * (1 - t) * t * (baseX + lean * 0.2) + t * t * topX;
    const y = (1 - t) * (1 - t) * baseY + 2 * (1 - t) * t * (baseY - height * 0.55) + t * t * topY;
    const width = Math.max(2, Math.round(5 - t * 2.4));
    for (let w = -1; w < width; w += 1) {
      c.set(x + w, y, w === -1 || w === width - 1 ? P.trunkDark : P.trunk);
    }
    if (i % 7 === 0) c.set(x + 1, y, P.trunkDark);
    if (i % 7 === 3) c.set(x + Math.max(1, width - 2), y, '#8f5a2c');
  }
  return [Math.round(topX), Math.round(topY)];
}

/**
 * Palm crown. `frame` 1 lifts the frond tips by a pixel: alternating the two frames is
 * the whole breeze animation, and it stays crisp because nothing rotates.
 */
export function drawPalmCrown(c, topX, topY, frame, flip = 1) {
  const lift = frame === 1 ? -1 : 0;
  const fronds = [
    [-26, 6, -13, -10],
    [-20, 16, -11, -3],
    [-8, 20, -5, 2],
    [24, 8, 12, -10],
    [19, 18, 10, -4],
    [7, 21, 4, 2],
  ];
  for (const [dx, dy, cx, cy] of fronds) {
    const ex = topX + dx * flip;
    const ey = topY + dy + lift;
    const mx = topX + cx * flip;
    const my = topY + cy + lift * 2;
    c.curve([topX, topY], [mx, my], [ex, ey], P.greenDark, 90);
    c.curve([topX, topY - 1], [mx, my - 1], [ex, ey - 1], P.green, 90);
    c.curve([topX, topY - 2], [mx, my - 3], [ex - dx * 0.18 * flip, ey - 3], P.greenLight, 90);
  }
  c.disc(topX, topY, 2, P.greenDark);
  for (const [dx, dy] of [[-2, 3], [2, 3], [0, 5]]) c.disc(topX + dx, topY + dy, 1, P.gold);
}

/** Beach parasol: a real dome with radial panels and a scalloped hem. */
function umbrella(c, x, y) {
  const top = y - 30;
  const radius = 23;
  for (let dy = -radius; dy <= 2; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const d = Math.sqrt(dx * dx + dy * dy * 2.4);
      if (d > radius) continue;
      const panel = Math.floor(((Math.atan2(-dy, dx) + Math.PI) / Math.PI) * 6);
      c.set(x + dx, top + dy, panel % 2 === 0 ? P.red : P.white);
    }
  }
  for (let dx = -radius; dx <= radius; dx += 1) {
    const hem = Math.round(2 + 1.5 * Math.sin((dx / radius) * Math.PI * 5));
    const d = Math.sqrt(dx * dx * 1.04);
    if (d > radius) continue;
    c.vLine(x + dx, top + 2, top + hem, Math.floor(((Math.atan2(0.01, dx) + Math.PI) / Math.PI) * 6) % 2 === 0 ? P.roofDark : P.wallShade);
  }
  c.disc(x, top - radius + 2, 1, P.gold);
  c.vLine(x, top, y, P.wallShade);
  c.vLine(x + 1, top, y, P.trunkDark);
  c.rect(x - 4, y, 9, 2, P.sandDark);
}

/** Towel, cooler and a sandcastle: the left beach needs somewhere for the eye to land. */
function beachKit(c, x, y) {
  c.rect(x, y, 30, 12, P.seaFar);
  for (let i = 0; i < 30; i += 6) c.rect(x + i, y, 3, 12, '#58c6e1');
  c.rect(x, y, 30, 1, P.white);
  c.rect(x, y + 11, 30, 1, '#1d4f86');
  c.rect(x + 34, y - 6, 12, 10, P.white);
  c.rect(x + 34, y - 6, 12, 3, P.red);
  c.rect(x + 34, y + 3, 12, 1, P.wallShade);
  const cx = x + 62;
  c.triangle([[cx - 9, y + 8], [cx, y - 8], [cx + 9, y + 8]], P.sandDark);
  c.triangle([[cx - 7, y + 7], [cx, y - 5], [cx + 6, y + 7]], P.sandLight);
  c.rect(cx - 12, y + 8, 25, 3, P.sandDark);
  c.vLine(cx, y - 14, y - 7, P.trunkDark);
  c.rect(cx + 1, y - 14, 6, 4, P.red);
  for (const dx of [-8, 0, 8]) {
    c.rect(cx + dx - 2, y + 2, 4, 6, P.sandLight);
    c.rect(cx + dx - 2, y + 2, 4, 1, P.sandDark);
  }
}

/** Beach volleyball court: perspective lines, net posts and a dotted mesh. */
function court(c) {
  c.line(250, 258, 300, 210, P.court);
  c.line(W - 1, 252, 470, 208, P.court);
  c.hLine(300, 470, 209, P.court);
  c.hLine(252, W - 1, 257, P.court);
  for (const [px, top, base] of [[NET.x0, NET.top, NET.base], [NET.x1, NET.top - 4, NET.base + 6]]) {
    c.rect(px - 1, top - 2, 3, base - top + 4, P.wall);
    c.vLine(px + 1, top - 2, base + 2, P.wallShade);
    c.vLine(px - 1, top - 2, base + 2, P.ink);
    c.rect(px - 3, base + 1, 7, 2, P.sandDark);
  }
  const slope = (x) => Math.round(NET.top + ((x - NET.x0) / (NET.x1 - NET.x0)) * -4);
  for (let x = NET.x0; x <= NET.x1; x += 1) {
    const top = slope(x);
    c.set(x, top - 1, P.white);
    c.set(x, top, P.white);
    c.set(x, top + 1, P.steelDark);
    c.set(x, top + 17, P.white);
    // Opaque mix of white and sand: the gaps between strands do the see-through work.
    if (x % 4 === 0) c.vLine(x, top + 3, top + 16, '#faf3e2');
    for (let y = top + 5; y < top + 17; y += 4) c.set(x, y, '#fdf9ee');
  }
}

function beach(c) {
  const rand = scatter(0x5e4705);
  for (let x = 0; x < W; x += 1) {
    const edge = shoreY(x);
    c.rect(x, edge, 1, 7, P.sandWet);
    c.rect(x, edge + 7, 1, H - edge - 7, P.sand);
  }
  // Warm the sand toward the bottom of frame so the beach has depth. Kept faint: a heavy
  // speckle over 74 rows reads as static, not sand.
  for (let y = 212; y < H; y += 1) {
    const mix = (y - 212) / (H - 212);
    for (let x = 0; x < W; x += 1) {
      if (rand() < mix * 0.22) c.set(x, y, P.sandWarm);
    }
  }
  for (let i = 0; i < c.density(420); i += 1) {
    const x = Math.floor(rand() * W);
    const y = 198 + Math.floor(rand() * 72);
    if (y <= shoreY(x) + 6) continue;
    c.set(x, y, rand() < 0.55 ? P.sandLight : P.sandDark);
  }
  for (let i = 0; i < c.density(16); i += 1) {
    const x = Math.floor(rand() * W);
    const y = 216 + Math.floor(rand() * 50);
    c.disc(x, y, 2, P.sandWarm);
    c.hLine(x - 1, x + 1, y - 2, P.sandLight);
  }
  // Shells.
  for (let i = 0; i < c.density(9); i += 1) {
    const x = Math.floor(rand() * W);
    const y = 230 + Math.floor(rand() * 36);
    c.set(x, y, P.white);
    c.set(x + 1, y, '#ffd9c0');
    c.set(x, y + 1, P.sandDark);
  }
}

/** Footprints wandering out of frame, so the sand does not look untouched. */
function footprints(c) {
  for (let i = 0; i < 13; i += 1) {
    const x = 150 + i * 11 + Math.round(3 * Math.sin(i / 2));
    const y = 268 - i * 5;
    c.rect(x, y, 2, 3, P.sandDark);
    c.rect(x + 5, y - 4, 2, 3, P.sandDark);
  }
}

export function drawPanorama(scale = 1) {
  const c = new Canvas(W, H, scale);
  sky(c);
  city(c);
  treeLine(c, 106, 176, (x) => 132 - Math.round(8 * Math.sin(((x - 106) / 70) * Math.PI)));
  merlion(c);
  treeLine(c, 214, W - 1, (x) => 130 - Math.round(24 * Math.sin(((x - 214) / 266) * Math.PI) + (x % 5 === 0 ? 1 : 0)));
  cableway(c);
  coaster(c);
  globe(c);
  resort(c);
  pavilion(c, 188, 128, 34);
  railway(c);
  sea(c);
  rocks(c);
  sailboat(c, 128, 172);
  sailboat(c, 196, 160);
  beach(c);
  court(c);
  footprints(c);
  const left = drawPalmTrunk(c, 40, 262, 74, -12);
  const right = drawPalmTrunk(c, 442, 268, 86, 14);
  umbrella(c, 104, 236);
  beachKit(c, 58, 230);
  return { canvas: c, palms: { left, right } };
}
