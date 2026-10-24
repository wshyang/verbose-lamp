import { Canvas } from '../../../pixel-canvas.mjs';
import { P, W, drawPalmCrown, scatter } from './pixel-art.mjs';

/**
 * The moving parts of the backdrop (ADR-022): one transparent PNG per layer, sized in the
 * same art units as the panorama so the generated anchors hold at either resolution
 * (ADR-023). Two-frame sheets put frame B to the right of frame A; the CSS shows exactly
 * one frame at a time, so a sheet layer is always sized to a single frame.
 */

export const CLOUD_H = 88;
export const WAVE_H = 46;
export const FOAM_H = 18;
export const CAR = { w: 15, h: 15 };
export const TRAIN = { w: 56, h: 13 };
export const BALL = 13;
export const BIRD = { w: 11, h: 7 };
export const PORTAL = { w: 66, h: 44 };
export const CROWN = { w: 58, h: 38, originX: 28, originY: 13 };

function cloud(c, x, y, scale) {
  const puffs = [[0, 0, 5], [7, -3, 6], [15, 0, 5], [-6, 2, 4], [21, 2, 4]];
  for (const [dx, dy, r] of puffs) c.disc(x + dx * scale, y + dy * scale, r * scale, P.cloud);
  // Shade only the underside of the cloud itself: a ruled line under the puffs looked
  // like a mistake in the first render.
  for (let px = Math.round(x - 12 * scale); px < x + 28 * scale; px += 1) {
    for (let py = c.unitsHigh - 1; py >= 0; py -= 1) {
      if (c.get(px, py)[3] === 0) continue;
      c.set(px, py, P.cloudShade);
      if (py > 0 && c.get(px, py - 1)[3] > 0) c.set(px, py - 1, '#f0f9ff');
      break;
    }
  }
}

export function clouds(scale) {
  const c = new Canvas(W, CLOUD_H, scale);
  cloud(c, 60, 22, 1);
  cloud(c, 150, 46, 0.8);
  cloud(c, 246, 16, 1.2);
  cloud(c, 360, 40, 0.9);
  cloud(c, 430, 20, 0.7);
  return c;
}

/** Swell highlights that drift across the bay; tiles seamlessly at 480 units. */
export function waves(scale) {
  const c = new Canvas(W, WAVE_H, scale);
  const rand = scatter(0x4a5e);
  for (let i = 0; i < c.density(150); i += 1) {
    const x = Math.floor(rand() * (W - 8));
    const y = 2 + Math.floor(rand() * (WAVE_H - 4));
    const length = 2 + Math.floor(rand() * 4) + Math.round(y / 12);
    c.hLine(x, x + length, y, y > 26 ? '#ffffffb0' : '#ecfbff80');
    if (rand() < 0.2) c.set(x + length + 1, y, '#ffffff60');
  }
  return c;
}

/** Two-frame surf: the foam line advances a unit and the bubbles change. */
export function foam(scale) {
  const c = new Canvas(W * 2, FOAM_H, scale);
  for (let frame = 0; frame < 2; frame += 1) {
    const ox = frame * W;
    for (let x = 0; x < W; x += 1) {
      const wobble = Math.round(1.6 * Math.sin((x + frame * 9) / 7) + 1.2 * Math.sin((x - frame * 5) / 3));
      const top = 4 + wobble + frame;
      c.set(ox + x, top, '#ffffffe6');
      c.set(ox + x, top + 1, '#ffffffcc');
      if ((x + frame * 3) % 5 === 0) c.set(ox + x, top - 1, '#ffffff99');
      if ((x * 7 + frame * 11) % 13 === 0) c.set(ox + x, top + 3, '#ffffff77');
    }
  }
  return c;
}

export function cableCar(scale) {
  const c = new Canvas(CAR.w, CAR.h, scale);
  c.vLine(7, 0, 3, P.steelDark);
  c.hLine(4, 10, 3, P.steelDark);
  c.rect(3, 4, 9, 9, P.red);
  c.rect(3, 4, 9, 2, '#ffd8b0');
  c.rect(4, 7, 7, 4, P.glass);
  c.hLine(3, 11, 12, '#7a2018');
  c.set(3, 4, P.ink);
  c.set(11, 4, P.ink);
  c.vLine(2, 5, 12, P.ink);
  c.vLine(12, 5, 12, P.ink);
  return c;
}

/** Sentosa Express: white body, blue flash, rounded nose leading right. */
export function express(scale) {
  const c = new Canvas(TRAIN.w, TRAIN.h, scale);
  c.rect(1, 1, TRAIN.w - 2, 10, P.wall);
  c.rect(1, 8, TRAIN.w - 2, 3, '#2f7dd1');
  c.rect(1, 1, TRAIN.w - 2, 2, '#cfe6f7');
  for (let x = 4; x < TRAIN.w - 6; x += 7) c.rect(x, 4, 4, 3, P.glass);
  c.rect(TRAIN.w - 6, 3, 4, 4, '#1d4f86');
  c.hLine(1, TRAIN.w - 2, 11, P.steelDark);
  c.set(0, 2, P.steelDark);
  c.set(TRAIN.w - 1, 2, P.steelDark);
  c.vLine(0, 3, 10, P.steelDark);
  c.vLine(TRAIN.w - 1, 3, 10, P.steelDark);
  for (let x = 6; x < TRAIN.w; x += 18) c.rect(x, 12, 6, 1, P.ink);
  return c;
}

export function ball(scale) {
  const c = new Canvas(BALL, BALL, scale);
  // A white ball against a white net and pale sand is invisible, so this one is a
  // yellow-and-royal beach volleyball with an ink contour.
  c.disc(6, 6, 5, P.white);
  c.curve([2, 2], [6, 6], [2, 10], '#1f4e9c', 60);
  c.curve([3, 1], [7, 6], [3, 11], '#1f4e9c', 60);
  c.curve([10, 2], [6, 7], [10, 10], '#ffc72c', 60);
  c.curve([9, 1], [5, 6], [9, 11], '#ffc72c', 60);
  c.disc(4, 4, 1, P.white);
  c.ring(6, 6, 5, '#12243a');
  return c;
}

/** Gull, two frames: wings up, wings level. */
export function birds(scale) {
  const c = new Canvas(BIRD.w * 2, BIRD.h, scale);
  const ink = '#2c3e56';
  c.line(0, 0, 4, 3, ink);
  c.line(4, 3, 6, 3, ink);
  c.line(6, 3, 10, 0, ink);
  c.line(1, 1, 4, 4, ink);
  c.line(6, 4, 9, 1, ink);
  c.line(BIRD.w, 4, BIRD.w + 4, 2, ink);
  c.line(BIRD.w + 4, 2, BIRD.w + 6, 2, ink);
  c.line(BIRD.w + 6, 2, BIRD.w + 10, 4, ink);
  c.line(BIRD.w + 2, 4, BIRD.w + 4, 3, ink);
  return c;
}

/**
 * Foreground tree clump at the left end of the rail beam. It is painted above the train
 * layer, which is what lets the Express appear and disappear instead of blinking on.
 */
export function portal(scale) {
  const c = new Canvas(PORTAL.w, PORTAL.h, scale);
  const rand = scatter(0x70a7a1);
  for (let i = 0; i < 26; i += 1) {
    const x = 6 + Math.floor(rand() * (PORTAL.w - 12));
    const y = 10 + Math.floor(rand() * 26);
    c.disc(x, y, 5 + Math.floor(rand() * 3), rand() < 0.35 ? P.greenLight : P.green);
    c.disc(x - 2, y + 3, 3, P.greenDark);
  }
  c.rect(0, PORTAL.h - 12, PORTAL.w, 12, P.greenDark);
  for (let x = 0; x < PORTAL.w; x += 5) c.disc(x, PORTAL.h - 12, 4, P.green);
  const [tx, ty] = [38, 30];
  c.vLine(tx, ty, PORTAL.h - 4, P.trunkDark);
  c.vLine(tx + 1, ty, PORTAL.h - 4, P.trunk);
  drawPalmCrown(c, tx, ty, 0, 1);
  return c;
}

/** Palm crown sheet: frame A at rest, frame B lifted a unit by the breeze. */
export function crown(scale, flip) {
  const c = new Canvas(CROWN.w * 2, CROWN.h, scale);
  drawPalmCrown(c, CROWN.originX, CROWN.originY, 0, flip);
  drawPalmCrown(c, CROWN.w + CROWN.originX, CROWN.originY, 1, flip);
  return c;
}

/* -------------------------------------------------------------------------- *
 * The players. Four of them keep a rally going over the net, in the PSD kit
 * from images/ingest/sentosa_backdrop.jpeg: navy singlet, white side panel,
 * gold trim, black shorts.
 * -------------------------------------------------------------------------- */

export const PLAYER = { w: 22, h: 30 };
const KIT = { shirt: '#1f4e9c', panel: '#f4f6fb', trim: '#ffc72c', shorts: '#232a36', shoe: '#f4f6fb' };

/** One player, drawn into `c` with their feet at (x, y). `pose` 1 is the reach. */
function player(c, x, y, look, pose) {
  const { skin, hair, build } = look;
  const reach = pose === 1;
  const lift = reach ? 1 : 0;
  const head = y - 21 - lift;
  const hip = y - 9 - lift;
  const shoulder = y - 15 - lift;
  const wide = build === 'masc';
  // Shadow on the sand, and it stays put while the player hops.
  c.hLine(x - 4, x + 4, y + 1, '#d9bf8e');
  c.hLine(x - 3, x + 3, y + 2, '#d0b683');
  // Legs: apart in the ready stance, tucked in the jump.
  const spread = reach ? 1 : 3;
  for (const side of [-1, 1]) {
    c.rect(x + side * spread - 1, hip, 2, reach ? 7 : 9 - lift, skin);
    c.rect(x + side * spread - 1, y - 1 - lift, 3, 2, KIT.shoe);
  }
  c.rect(x - spread - 2, hip - 1, spread * 2 + 4, 4, KIT.shorts);
  // Torso: shirt, side panel, gold collar, and a darker edge so the figure reads against
  // the sand at display size.
  const chest = wide ? 4 : 3;
  c.rect(x - chest, shoulder, chest * 2 + 1, hip - shoulder + 1, KIT.shirt);
  c.rect(x + chest - 1, shoulder + 1, 2, hip - shoulder, KIT.panel);
  c.vLine(x - chest, shoulder + 1, hip, '#163a75');
  c.hLine(x - chest + 1, x + chest - 1, shoulder, KIT.trim);
  // Arms: out at the sides in the ready stance, up over the head for the ball.
  for (const side of [-1, 1]) {
    const ax = x + side * (chest + 1);
    if (reach) {
      c.line(ax, shoulder + 1, ax + side * 2, shoulder - 7, skin);
      c.set(ax + side * 2, shoulder - 8, skin);
    } else {
      c.line(ax, shoulder + 1, ax + side * 2, hip, skin);
      c.rect(ax + side * 2, hip + 1, 1, 2, skin);
    }
  }
  // Head, then hair: a crop on the masculine build, a ponytail on the feminine one.
  c.rect(x - 2, head, 5, 5, skin);
  c.set(x - 1, head + 3, P.ink);
  c.set(x + 1, head + 3, P.ink);
  c.rect(x - 2, head - 1, 5, 2, hair);
  if (wide) {
    c.set(x - 3, head + 1, hair);
    c.set(x + 3, head + 1, hair);
  } else {
    c.rect(x - 3, head - 1, 1, 4, hair);
    c.rect(x + 3, head - 1, 1, 4, hair);
    c.rect(x + 3, head + 2, 2, 5, hair);
  }
  c.rect(x - 1, head + 5, 3, 1, skin);
}

const LOOKS = [
  { skin: '#e0a878', hair: '#1d1d28', build: 'masc' },
  { skin: '#f6d5b8', hair: '#5a3418', build: 'fem' },
  { skin: '#c98a58', hair: '#2b1d16', build: 'fem' },
  { skin: '#eec096', hair: '#3a2a1c', build: 'masc' },
];

/**
 * A player as a two-frame sheet: ready stance, then the reach. The feet stay on the same
 * unit in both frames so the sprite never appears to slide.
 */
export function playerSheet(scale, index) {
  const c = new Canvas(PLAYER.w * 2, PLAYER.h, scale);
  const look = LOOKS[index % LOOKS.length];
  player(c, Math.floor(PLAYER.w / 2), PLAYER.h - 3, look, 0);
  player(c, PLAYER.w + Math.floor(PLAYER.w / 2), PLAYER.h - 3, look, 1);
  return c;
}

/** Where each player stands: art units for the foot position, plus their flip timing. */
export const PLAYERS = [
  { index: 0, x: 342, y: 226, period: '0.72s' },
  { index: 1, x: 404, y: 222, period: '0.94s' },
  { index: 2, x: 356, y: 245, period: '0.83s' },
  { index: 3, x: 430, y: 248, period: '1.12s' },
];
