/**
 * ADR-299 — the layers of the CSC @ Tessensohn backdrop, back to front, as data.
 *
 * The files are CSC's own (docs/design/tessensohn-scene-credits.md) and live in
 * `public/themes/tessensohn/scene/`. `cls` is the `csc-` class `scene.css` positions and animates
 * the layer by (the prefix is added when rendered); a group's first layer only gives the group
 * its size, and the rest are laid over it. The data mirrors the phone banner on csc.sg; the
 * `court` marker is where this project places the badminton court, behind the foreground
 * characters and in front of the lawn.
 */

export interface SceneLayer {
  readonly file: string;
  readonly cls: string | null;
}

export interface SceneGroup {
  readonly kind: 'group';
  readonly name: string;
  readonly layers: readonly SceneLayer[];
}

export type SceneNode =
  | ({ readonly kind: 'layer' } & { readonly cls: string; readonly file: string })
  | SceneGroup
  | { readonly kind: 'court' };

/** Where the files are served from. Every URL gets the content stamp from `art/sceneVersion.ts`. */
export const SCENE_BASE = '/themes/tessensohn/scene';

export const SCENE_NODES: readonly SceneNode[] = [
  { kind: 'layer', cls: 'bg', file: 'bg.svg' },
  { kind: 'layer', cls: 'cloud3', file: 'cloud3.svg' },
  { kind: 'layer', cls: 'cloud4', file: 'cloud4.svg' },
  { kind: 'layer', cls: 'building', file: 'mobilebuilding.png' },
  { kind: 'layer', cls: 'hill', file: 'hill.svg' },
  { kind: 'layer', cls: 'ground', file: 'groundmobile2.svg' },
  { kind: 'layer', cls: 'bbqtent', file: 'bbqtent.svg' },
  { kind: 'layer', cls: 'pot', file: 'pot.svg' },
  { kind: 'group', name: 'bbq', layers: [
      { file: 'bbq.svg', cls: null },
      { file: 'bbqtong.svg', cls: 'bbqtong' },
      { file: 'bbqmain.svg', cls: 'bbqmain' },
      { file: 'bbqbaby.svg', cls: 'bbqbaby' },
      { file: 'bbqhead.svg', cls: 'bbqhead' }
    ] },
  { kind: 'layer', cls: 'smoke1', file: 'smoke1.svg' },
  { kind: 'layer', cls: 'smoke2', file: 'smoke2.svg' },
  { kind: 'layer', cls: 'house', file: 'housemobile.svg' },
  { kind: 'group', name: 'sparkler', layers: [
      { file: 'sparkler.svg', cls: null },
      { file: 'sparkler1main.svg', cls: 'sparkler1main' },
      { file: 'sparkler1head.svg', cls: 'sparkler1head' },
      { file: 'sparkler1hand.svg', cls: 'sparkler1hand' }
    ] },
  { kind: 'group', name: 'pet', layers: [
      { file: 'pet.svg', cls: null },
      { file: 'pettail.svg', cls: 'pettail' },
      { file: 'petdog.svg', cls: 'petdog' },
      { file: 'petmain.svg', cls: 'petmain' },
      { file: 'petarm.svg', cls: 'petarm' }
    ] },
  { kind: 'layer', cls: 'palmtree', file: 'palmtree.svg' },
  { kind: 'layer', cls: 'bush2', file: 'bush2.svg' },
  { kind: 'layer', cls: 'loyangsign', file: 'loyangsign.png' },
  { kind: 'layer', cls: 'bush1', file: 'bush1.svg' },
  { kind: 'layer', cls: 'ground', file: 'groundmobile.svg' },
  { kind: 'court' },
  { kind: 'group', name: 'car', layers: [
      { file: 'car.svg', cls: null },
      { file: 'carshadow.svg', cls: 'carshadow' },
      { file: 'carmain.svg', cls: 'carmain' },
      { file: 'carwheel1.svg', cls: 'carwheel1' },
      { file: 'carwheel2.svg', cls: 'carwheel2' }
    ] },
  { kind: 'group', name: 'bike2', layers: [
      { file: 'bike2.svg', cls: null },
      { file: 'bikeshadow2.svg', cls: 'bikeshadow2' },
      { file: 'bike2wheelinner.svg', cls: 'bike2wheel11' },
      { file: 'bike2tire.svg', cls: 'bike2wheel12' },
      { file: 'bike2wheelinner.svg', cls: 'bike2wheel21' },
      { file: 'bike2tire.svg', cls: 'bike2wheel22' },
      { file: 'bike2arm2.svg', cls: 'bike2arm2' },
      { file: 'bike2leg1.svg', cls: 'bike2leg1' },
      { file: 'bike2pedal1.svg', cls: 'bike2pedal1' },
      { file: 'bike2main.svg', cls: 'bike2main' },
      { file: 'bike2pedalwheel.svg', cls: 'bike2pedalwheel' },
      { file: 'bike2pedal2.svg', cls: 'bike2pedal2' },
      { file: 'bike2leg2.svg', cls: 'bikeleg2' },
      { file: 'bike2man.svg', cls: 'bike2man' },
      { file: 'bike2arm1.svg', cls: 'bike2arm1' }
    ] },
];

/** The court: the lines, the net and two players, each player a cut-out group of its own. */
export const COURT_FRAME: readonly (SceneLayer | SceneGroup)[] = [
  { file: 'court.svg', cls: null },
  { file: 'net.svg', cls: 'net' },
  { kind: 'group', name: 'tennis1', layers: [
      { file: 'tennis1.svg', cls: null },
      { file: 'tennis1leg.svg', cls: 'tennis1leg' },
      { file: 'tennis2leg.svg', cls: 'tennis2leg' },
      { file: 'tennis1racket.svg', cls: 'tennis1racket' },
      { file: 'tennis1main.svg', cls: 'tennis1main' },
      { file: 'tennis1head.svg', cls: 'tennis1head' },
      { file: 'tennisball.svg', cls: 'tennisball' },
      { file: 'tennis1arm2.svg', cls: 'tennis1arm2' },
  ] },
  { kind: 'group', name: 'tennis2', layers: [
      { file: 'tennis2.svg', cls: null },
      { file: 'tennis2leg1.svg', cls: 'tennis2leg1' },
      { file: 'tennis2leg2.svg', cls: 'tennis2leg2' },
      { file: 'tennis2main.svg', cls: 'tennis2main' },
      { file: 'tennis2arm.svg', cls: 'tennis2arm' },
  ] },
];

/**
 * The wide scene: CSC's desktop banner, back to front, for screens wider than a phone. It is a
 * different composition, not the phone one scaled up (its own art positions, the court and net
 * drawn by CSC on the ground, a pool, a grocery shopper, ferns), so it is its own list. Its
 * aspect is that of CSC's own banner placeholder, 3259 x 1204.
 */
export const WIDE_ASPECT = 3259 / 1204;

export const WIDE_NODES: readonly SceneNode[] = [
  { kind: 'layer', cls: 'bg', file: 'bg.svg' },
  { kind: 'layer', cls: 'cloud1', file: 'cloud1.svg' },
  { kind: 'layer', cls: 'cloud2', file: 'cloud2.svg' },
  { kind: 'layer', cls: 'cloud3', file: 'cloud3.svg' },
  { kind: 'layer', cls: 'cloud4', file: 'cloud4.svg' },
  { kind: 'layer', cls: 'cloud5', file: 'cloud5.svg' },
  { kind: 'layer', cls: 'fern1', file: 'fern1.svg' },
  { kind: 'layer', cls: 'fern2', file: 'fern2.svg' },
  { kind: 'layer', cls: 'fern3', file: 'fern3.svg' },
  { kind: 'layer', cls: 'fernleaf1', file: 'fernleaf1.svg' },
  { kind: 'layer', cls: 'fernleaf2', file: 'fernleaf2.svg' },
  { kind: 'layer', cls: 'hill', file: 'hill.svg' },
  { kind: 'layer', cls: 'bgtree1', file: 'bgtree1.svg' },
  { kind: 'layer', cls: 'bgtree2', file: 'bgtree2.svg' },
  { kind: 'layer', cls: 'bbqtent', file: 'bbqtent.svg' },
  { kind: 'layer', cls: 'building', file: 'building.png' },
  { kind: 'layer', cls: 'house', file: 'house.svg' },
  { kind: 'group', name: 'dog', layers: [
      { file: 'dog.svg', cls: null },
      { file: 'dogtail.svg', cls: 'dogtail' },
      { file: 'dogmain.svg', cls: 'dogmain' }
    ] },
  { kind: 'layer', cls: 'palmtree', file: 'palmtree.svg' },
  { kind: 'layer', cls: 'bush2', file: 'bush2.svg' },
  { kind: 'layer', cls: 'loyangsign', file: 'loyangsign.png' },
  { kind: 'layer', cls: 'bush1', file: 'bush1.svg' },
  { kind: 'group', name: 'sparkler', layers: [
      { file: 'sparkler.svg', cls: null },
      { file: 'sparkler1main.svg', cls: 'sparkler1main' },
      { file: 'sparkler2main.svg', cls: 'sparkler2main' },
      { file: 'sparkler3main.svg', cls: 'sparkler3main' },
      { file: 'sparkler1head.svg', cls: 'sparkler1head' },
      { file: 'sparkler1hand.svg', cls: 'sparkler1hand' },
      { file: 'sparkler2head.svg', cls: 'sparkler2head' },
      { file: 'sparkler2hand1.svg', cls: 'sparkler2hand1' },
      { file: 'sparkler2hand2.svg', cls: 'sparkler2hand2' },
      { file: 'sparkler3hand1.svg', cls: 'sparkler3hand1' },
      { file: 'sparkler3hand2.svg', cls: 'sparkler3hand2' },
      { file: 'sparkler3head.svg', cls: 'sparkler3head' }
    ] },
  { kind: 'group', name: 'grocery', layers: [
      { file: 'grocery.svg', cls: null },
      { file: 'groceryhair.svg', cls: 'groceryhair' },
      { file: 'grocerymain.svg', cls: 'grocerymain' },
      { file: 'groceryhead.svg', cls: 'groceryhead' }
    ] },
  { kind: 'layer', cls: 'smoke1', file: 'smoke1.svg' },
  { kind: 'layer', cls: 'smoke2', file: 'smoke2.svg' },
  { kind: 'layer', cls: 'pot', file: 'pot.svg' },
  { kind: 'group', name: 'bbq', layers: [
      { file: 'bbq.svg', cls: null },
      { file: 'bbqtong.svg', cls: 'bbqtong' },
      { file: 'bbqmain.svg', cls: 'bbqmain' },
      { file: 'bbqbaby.svg', cls: 'bbqbaby' },
      { file: 'bbqhead.svg', cls: 'bbqhead' }
    ] },
  { kind: 'layer', cls: 'ground', file: 'ground.svg' },
  { kind: 'layer', cls: 'table1', file: 'table1.svg' },
  { kind: 'layer', cls: 'table2', file: 'table2.svg' },
  { kind: 'group', name: 'pet', layers: [
      { file: 'pet.svg', cls: null },
      { file: 'pettail.svg', cls: 'pettail' },
      { file: 'petdog.svg', cls: 'petdog' },
      { file: 'petmain.svg', cls: 'petmain' },
      { file: 'petarm.svg', cls: 'petarm' }
    ] },
  { kind: 'layer', cls: 'tree1', file: 'tree1.svg' },
  { kind: 'layer', cls: 'tree2', file: 'tree2.svg' },
  { kind: 'layer', cls: 'leaf1', file: 'treeleafleft.svg' },
  { kind: 'layer', cls: 'leaf2', file: 'treeleafright.svg' },
  { kind: 'layer', cls: 'leaf3', file: 'treeleafleft.svg' },
  { kind: 'group', name: 'bike1', layers: [
      { file: 'bike1.svg', cls: null },
      { file: 'bikeshadow1.svg', cls: 'bikeshadow1' },
      { file: 'bike1wheel1.svg', cls: 'bike1wheel1' },
      { file: 'bike1wheel2.svg', cls: 'bike1wheel2' },
      { file: 'bike1arm.svg', cls: 'bike1arm' },
      { file: 'bike1leg2.svg', cls: 'bike1leg2' },
      { file: 'bike1main.svg', cls: 'bike1main' },
      { file: 'bike1leg1.svg', cls: 'bike1leg1' },
      { file: 'bike1body.svg', cls: 'bike1body' }
    ] },
  { kind: 'group', name: 'bike2', layers: [
      { file: 'bike2.svg', cls: null },
      { file: 'bikeshadow2.svg', cls: 'bikeshadow2' },
      { file: 'bike2wheelinner.svg', cls: 'bike2wheel11' },
      { file: 'bike2tire.svg', cls: 'bike2wheel12' },
      { file: 'bike2wheelinner.svg', cls: 'bike2wheel21' },
      { file: 'bike2tire.svg', cls: 'bike2wheel22' },
      { file: 'bike2arm2.svg', cls: 'bike2arm2' },
      { file: 'bike2leg1.svg', cls: 'bike2leg1' },
      { file: 'bike2pedal1.svg', cls: 'bike2pedal1' },
      { file: 'bike2main.svg', cls: 'bike2main' },
      { file: 'bike2pedalwheel.svg', cls: 'bike2pedalwheel' },
      { file: 'bike2pedal2.svg', cls: 'bike2pedal2' },
      { file: 'bike2leg2.svg', cls: 'bikeleg2' },
      { file: 'bike2man.svg', cls: 'bike2man' },
      { file: 'bike2arm1.svg', cls: 'bike2arm1' }
    ] },
  { kind: 'layer', cls: 'court', file: 'court.svg' },
  { kind: 'layer', cls: 'pool', file: 'pool.svg' },
  { kind: 'layer', cls: 'poolshine', file: 'poolshine.svg' },
  { kind: 'group', name: 'car', layers: [
      { file: 'car.svg', cls: null },
      { file: 'carshadow.svg', cls: 'carshadow' },
      { file: 'carmain.svg', cls: 'carmain' },
      { file: 'carwheel1.svg', cls: 'carwheel1' },
      { file: 'carwheel2.svg', cls: 'carwheel2' }
    ] },
  { kind: 'layer', cls: 'net', file: 'net.svg' },
  { kind: 'group', name: 'swimsuit', layers: [
      { file: 'swimsuit.svg', cls: null },
      { file: 'swimsuitfloat.svg', cls: 'swimsuitfloat' },
      { file: 'swimsuitleg1.svg', cls: 'swimsuitleg1' },
      { file: 'swimsuithair.svg', cls: 'swimsuithair' },
      { file: 'swimsuitarm1.svg', cls: 'swimsuitarm1' },
      { file: 'swimsuitarm2.svg', cls: 'swimsuitarm2' },
      { file: 'swimsuitmain.svg', cls: 'swimsuitmain' },
      { file: 'swimsuitleg2.svg', cls: 'swimsuitleg2' },
      { file: 'swimsuithead.svg', cls: 'swimsuithead' }
    ] },
  { kind: 'group', name: 'boy', layers: [
      { file: 'boy.svg', cls: null },
      { file: 'boyarm1.svg', cls: 'boyarm1' },
      { file: 'boymain.svg', cls: 'boymain' },
      { file: 'boyarm2.svg', cls: 'boyarm2' },
      { file: 'boyhead.svg', cls: 'boyhead' }
    ] },
  { kind: 'group', name: 'kid', layers: [
      { file: 'kid.svg', cls: null },
      { file: 'kidarm1.svg', cls: 'kidarm1' },
      { file: 'kidarm2.svg', cls: 'kidarm2' },
      { file: 'kidmain.svg', cls: 'kidmain' },
      { file: 'kidhead.svg', cls: 'kidhead' }
    ] },
  { kind: 'layer', cls: 'float', file: 'float.svg' },
  { kind: 'layer', cls: 'beachball', file: 'beachball.svg' },
  { kind: 'group', name: 'donut', layers: [
      { file: 'donut.svg', cls: null },
      { file: 'donut.svg', cls: 'donutmain' }
    ] },
  { kind: 'group', name: 'tennis1', layers: [
      { file: 'tennis1.svg', cls: null },
      { file: 'tennis1leg.svg', cls: 'tennis1leg' },
      { file: 'tennis2leg.svg', cls: 'tennis2leg' },
      { file: 'tennis1racket.svg', cls: 'tennis1racket' },
      { file: 'tennis1main.svg', cls: 'tennis1main' },
      { file: 'tennis1head.svg', cls: 'tennis1head' },
      { file: 'tennisball.svg', cls: 'tennisball' },
      { file: 'tennis1arm2.svg', cls: 'tennis1arm2' }
    ] },
  { kind: 'group', name: 'tennis2', layers: [
      { file: 'tennis2.svg', cls: null },
      { file: 'tennis2leg1.svg', cls: 'tennis2leg1' },
      { file: 'tennis2leg2.svg', cls: 'tennis2leg2' },
      { file: 'tennis2main.svg', cls: 'tennis2main' },
      { file: 'tennis2arm.svg', cls: 'tennis2arm' }
    ] },
];
