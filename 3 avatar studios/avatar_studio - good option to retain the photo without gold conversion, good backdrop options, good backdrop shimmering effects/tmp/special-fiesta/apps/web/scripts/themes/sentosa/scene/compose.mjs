/**
 * ADR-022 / ADR-298 — how Sentosa's classic scene is composed: which layers, where they sit and
 * what the CSS animates. The theme-agnostic half (hashing, PNG writing, the generated TypeScript)
 * is `scripts/scene/pixel-scene.mjs`; this is the part that is Sentosa.
 *
 * Moved out of `generate-pixel.mjs` verbatim, with the layout helpers now taken from
 * `layoutFor(W, H)` instead of being closed over this plate's size.
 */
import { layoutFor } from '../../../scene/layout.mjs';
import { CABLE_Y, H, NET, RAIL, W, drawPanorama } from './pixel-art.mjs';
import {
  BALL,
  BIRD,
  CAR,
  CLOUD_H,
  CROWN,
  FOAM_H,
  PLAYER,
  PLAYERS,
  PORTAL,
  TRAIN,
  WAVE_H,
  ball,
  birds,
  cableCar,
  clouds,
  crown,
  express,
  foam,
  playerSheet,
  portal,
  waves,
} from './pixel-sprites.mjs';

const { anchor, frame, strip } = layoutFor(W, H);

/** Art x where a cable car enters; CSS `gb-scene-cable` carries it off the far side. */
const CABIN_START = -20;

/** Draws one variant and returns its layers, the geometry and the art-space positions. */
function compose(scale) {
  const layers = [];
  const geometry = {};
  const art = {};
  const add = (name, canvas, style, at) => {
    layers.push([name, canvas]);
    geometry[name] = style;
    art[name] = { canvas, x: at[0], y: at[1] };
  };
  const drawn = drawPanorama(scale);
  // The panorama is the bottom layer: a translucent pixel there would blend with the page
  // background and show up as a dirty halo.
  for (let i = 3; i < drawn.canvas.data.length; i += 4) {
    if (drawn.canvas.data[i] !== 255) throw new Error(`panorama pixel ${(i - 3) / 4} is not opaque`);
  }
  add('panorama', drawn.canvas, { backgroundSize: '100% 100%' }, [0, 0]);
  add('clouds', clouds(scale), strip({ unitsHigh: CLOUD_H }, 0), [0, 0]);
  add('waves', waves(scale), strip({ unitsHigh: WAVE_H }, 150), [0, 150]);
  add('foam', foam(scale), strip({ unitsHigh: FOAM_H }, 186), [0, 186]);
  // The cabin rides off frame at both ends — but a background can NEVER paint outside its
  // layer box, so anchoring it at a negative background-position does not park it off-left,
  // it clips it invisible for the whole loop (that is how the cabins vanished). The sprite
  // therefore anchors INSIDE the box at x = 0 and the off-frame entry lives in the CSS
  // transform instead: `gb-scene-cable` starts at translateX(CABIN_START / W) and ends one
  // car width past the right edge. The cable's height is still sampled at the entry point.
  const cable = [CABIN_START, Math.round(CABLE_Y(CABIN_START)) + 4];
  add('cablecar', cableCar(scale), anchor({ units: CAR.w, unitsHigh: CAR.h }, 0, cable[1]), cable);
  const train = [RAIL.x0 - TRAIN.w + 8, RAIL.y - TRAIN.h + 2];
  add('express', express(scale), anchor({ units: TRAIN.w, unitsHigh: TRAIN.h }, ...train), train);
  const clump = [RAIL.x0 - PORTAL.w + 14, RAIL.y - PORTAL.h + 10];
  add('portal', portal(scale), anchor({ units: PORTAL.w, unitsHigh: PORTAL.h }, ...clump), clump);
  // The rally starts low on the near side; the CSS arcs the ball up over the net, which is
  // the only place it is clearly visible against the sea rather than against the mesh.
  const serve = [NET.x0 + 10, NET.base - 26];
  add('ball', ball(scale), anchor({ units: BALL, unitsHigh: BALL }, ...serve), serve);
  const gulls = [168, 44];
  add('birds', birds(scale), frame({ units: BIRD.w * 2, unitsHigh: BIRD.h }, ...gulls), gulls);
  for (const [name, flip, top] of [['palmLeft', 1, drawn.palms.left], ['palmRight', -1, drawn.palms.right]]) {
    const at = [top[0] - CROWN.originX, top[1] - CROWN.originY];
    add(name, crown(scale, flip), frame({ units: CROWN.w * 2, unitsHigh: CROWN.h }, ...at), at);
  }
  PLAYERS.forEach((spot, i) => {
    const at = [spot.x - Math.floor(PLAYER.w / 2), spot.y - PLAYER.h + 3];
    add(`player${i + 1}`, playerSheet(scale, spot.index), frame({ units: PLAYER.w * 2, unitsHigh: PLAYER.h }, ...at), at);
  });
  return { layers, geometry, art, palms: drawn.palms };
}

export const SCENE = {
  id: 'sentosa',
  size: { width: W, height: H },
  /** The component that spreads these layers; named in the generated file's header comment. */
  componentName: 'SentosaScene',
  playerPeriods: PLAYERS.map((spot) => spot.period),
  compose,
};
