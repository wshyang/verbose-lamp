import {
  REAL_BOATS,
  REAL_CABLECARS,
  REAL_MOORED,
  REAL_PLAYERS_FAR,
  REAL_PLAYERS_NEAR,
  REAL_PLAYER_PERIODS,
  SCENE_PARTS_REAL,
  type RealScenePart,
} from './art/realArt.js';
import { required } from '../../lib/required.js';
import type { CSSProperties } from 'react';

/**
 * ADR-193..200 — the photoreal Sentosa backdrop, reached by `?backdrop=real`.
 *
 * Built inert over seven ADRs and switched on in ADR-200. `<SentosaScene>` still draws every
 * participant surface by default; this takes over only when the parameter asks for it, and
 * nothing in the UI offers it, because it is fifteen megabytes of photograph against a few
 * hundred kilobytes of pixel art.
 *
 * What makes this more than `<SentosaScene>` with different files is the net. In the drawn
 * scene the net is painted into the panorama, and the panorama is the bottom layer, so
 * every player is in front of it — including the two who are meant to be on the far side
 * of the court. Here the net is its own layer with players either side of it, which is the
 * only reason the court has a far side at all. The same trick the scene already used once,
 * in `portal`: a tree clump whose entire job is to be in front of the Express so the train
 * can disappear behind it rather than blink out.
 *
 * ADR-195 carried the same reasoning into the backdrop itself. The Merlion, the ferry
 * terminal, the umbrella, the deck chair and the near sea are now layers too — not because
 * anything passes behind them, but because while they were painted in, moving any one of
 * them meant re-rendering the whole panorama and re-tuning every other layer against it.
 *
 * ADR-198 made every repeated thing a ROSTER. A cable car, a boat and a player are item
 * types with several variants each, and the component iterates the lists the generator
 * emits rather than naming slots. Three identical cabins staggered by delay read as one
 * cabin, because the eye catches the repeat long before it counts them; three liveries do
 * not. The stagger itself moved into the geometry, so a fourth cabin is a line of data.
 *
 * ADR-201 added the two things the scene had been standing on nothing without: the cable
 * the cabins hang from, and the guideway the Express runs on. Each is drawn immediately
 * before the thing it carries, which is the only ordering readable at a glance as "this
 * holds that up". The cabins moved up with their cable, above the island landmarks: a
 * cable car crosses in front of the skyline, not behind the trees it is heading for.
 *
 * Order below is back to front, and three adjacencies are load-bearing: far players before
 * the net, the net before near players, and the palms last because they are the closest
 * thing in frame and must crop everything, players included. The water goes under the
 * surf and the glints, and the two landmarks sit on top of it because both stand in it.
 *
 * Why a second component rather than a third branch inside `<SentosaScene>`: the two differ
 * in more than their files. The pixel scene is drawn under `image-rendering: pixelated` at
 * 480x270, where a half-pixel is a visible step; this is 3840x2160 of photograph, where
 * the same rule aliases every frond into a sawtooth. `gb-scene--real` turns smoothing back
 * on, and that is a property of the art, not of the layer.
 *
 * Decoration, like `<SentosaScene>`: `aria-hidden`, pointer-events free, participant-only.
 */

function layerStyle(part: RealScenePart, extra?: Record<string, string>): CSSProperties {
  return { backgroundImage: `url('${part.src}')`, ...part.style, ...extra } as CSSProperties;
}

/*
 * ADR-199 — one div, and the class comes from the part.
 *
 * The z-order below is still written out longhand, because the order IS the design and a
 * loop over `ORDER` would hide the three adjacencies the whole scene rests on. What is no
 * longer written out is which class each layer carries: that is generated, so the review
 * page draws exactly what this draws.
 */
function Layer(props: { part: RealScenePart; testId?: string }) {
  return (
    <div className={props.part.className} style={layerStyle(props.part)}
      {...(props.testId === undefined ? {} : { 'data-testid': props.testId })} />
  );
}

/** Figures flip on their own period so eight of them never move as one. */
function Player(props: { part: RealScenePart; index: number }) {
  return (
    <div
      className={props.part.className}
      style={layerStyle(props.part, {
        '--gb-period': required(
          REAL_PLAYER_PERIODS[props.index % REAL_PLAYER_PERIODS.length], 'period',
        ),
      })}
      data-testid="real-beach-scene__player"
    />
  );
}

export function SentosaRealScene() {
  const parts = SCENE_PARTS_REAL;
  return (
    <div className="gb-scene gb-scene--real" aria-hidden="true" data-testid="real-beach-scene">
      <Layer part={parts.panorama} />
      <Layer part={parts.clouds} />
      <Layer part={parts.cable} />
      {REAL_CABLECARS.map((part) => (
        <Layer key={part.src} part={part} testId="real-beach-scene__cablecar" />
      ))}
      <Layer part={parts.skyHelix} />
      <Layer part={parts.uss} />
      {REAL_BOATS.map((part) => (
        <Layer key={part.src} part={part} testId="real-beach-scene__boat" />
      ))}
      <Layer part={parts.water} />
      <Layer part={parts.waves} />
      <Layer part={parts.foam} />
      <Layer part={parts.merlion} />
      <Layer part={parts.guideway} />
      <Layer part={parts.express} />
      <Layer part={parts.portal} />
      <Layer part={parts.ferryJetty} />
      {REAL_MOORED.map((part) => (
        <Layer key={part.src} part={part} />
      ))}
      <Layer part={parts.ferryTerminal} />
      <Layer part={parts.birds} />
      <Layer part={parts.umbrella} />
      <Layer part={parts.deckchair} />
      {REAL_PLAYERS_FAR.map((part, index) => (
        <Player key={part.src} part={part} index={index} />
      ))}
      <Layer part={parts.net} testId="real-beach-scene__net" />
      {REAL_PLAYERS_NEAR.map((part, index) => (
        <Player key={part.src} part={part} index={index + REAL_PLAYERS_FAR.length} />
      ))}
      <div className="gb-scene__layer gb-scene__serve">
        <Layer part={parts.ball} />
      </div>
      <Layer part={parts.palmLeft} />
      <Layer part={parts.palmRight} />
    </div>
  );
}
