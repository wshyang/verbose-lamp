import { useLocation } from 'react-router-dom';
import { PLAYER_PERIODS, SCENE_PARTS, SCENE_PARTS_FINE } from './art/pixelArt.js';
import { resolveBackdrop } from '../../lib/scene/backdropChoice.js';
import { SentosaRealScene } from './SentosaRealScene.js';
import { required } from '../../lib/required.js';
import type { CSSProperties } from 'react';

/**
 * The Sentosa backdrop (ADR-022): a pixel panorama drawn from
 * images/ingest/sentosa_backdrop.jpeg, plus one layer per moving part — clouds, swell,
 * surf, cable cars crossing the whole sky, the Sentosa Express, gulls, palm crowns in the
 * breeze, four players keeping a rally going and the ball they are hitting.
 *
 * Layers are positioned in percentages of the scene box, generated next to the art in
 * art/pixelArt.ts; this component only spreads them. Sprite sheets get a box exactly one
 * frame wide (ADR-022) — a layer sized to the whole sheet draws every frame at once.
 * Motion is CSS-only and `prefers-reduced-motion` stops it in styles/gameboy.css.
 *
 * ADR-023: `?backdrop=fine` swaps in the two-pixels-per-unit art for the A/B comparison.
 *
 * ADR-200: `?backdrop=real` hands over to `<SentosaRealScene>` entirely. That one is not a
 * variant of this art — it is a different scene with nineteen layers, its own geometry and
 * smoothing turned back on — so this component dispatches rather than branching. A third
 * `parts` table would have been the cheap move and the wrong one: the real scene has four
 * more players, three different cable cars and a net that has to be drawn between them,
 * none of which this component's fixed z-order can express.
 *
 * Decoration, like the motifs (ADR-014): `aria-hidden`, pointer-events free, and
 * participant-only — `npm run standards` fails if it is imported by a staff surface.
 */

type Part = { src: string; style: Record<string, string> };

function layerStyle(part: Part, extra?: Record<string, string>): CSSProperties {
  return { backgroundImage: `url('${part.src}')`, ...part.style, ...extra } as CSSProperties;
}

/** Cable cars share one sprite and one path; the negative delays space them along it. */
const CABINS = ['0s', '-11s', '-22s'];

export function SentosaScene() {
  const choice = resolveBackdrop(useLocation().search);
  if (choice === 'real') return <SentosaRealScene />;
  const parts = choice === 'fine' ? SCENE_PARTS_FINE : SCENE_PARTS;
  const players = [parts.player1, parts.player2, parts.player3, parts.player4];
  return (
    <div className="gb-scene" aria-hidden="true" data-testid="beach-scene">
      <div className="gb-scene__layer gb-scene__panorama" style={layerStyle(parts.panorama)} />
      <div className="gb-scene__layer gb-scene__drift gb-scene__clouds" style={layerStyle(parts.clouds)} />
      <div className="gb-scene__layer gb-scene__drift gb-scene__waves" style={layerStyle(parts.waves)} />
      <div className="gb-scene__layer gb-scene__foam" style={layerStyle(parts.foam)} />
      {CABINS.map((delay) => (
        <div
          key={delay}
          className="gb-scene__layer gb-scene__cablecar"
          style={{ ...layerStyle(parts.cablecar), animationDelay: delay }}
          data-testid="beach-scene__cablecar"
        />
      ))}
      <div className="gb-scene__layer gb-scene__express" style={layerStyle(parts.express)} />
      <div className="gb-scene__layer gb-scene__portal" style={layerStyle(parts.portal)} />
      <div className="gb-scene__frame gb-scene__gulls" style={layerStyle(parts.birds)} />
      <div className="gb-scene__frame gb-scene__palm" style={layerStyle(parts.palmLeft)} />
      <div className="gb-scene__frame gb-scene__palm" style={layerStyle(parts.palmRight)} />
      {players.map((player, index) => (
        <div
          key={player.src}
          className="gb-scene__frame gb-scene__player"
          style={layerStyle(player, { '--gb-period': required(PLAYER_PERIODS[index], 'player period') })}
          data-testid="beach-scene__player"
        />
      ))}
      <div className="gb-scene__layer gb-scene__serve">
        <div className="gb-scene__layer gb-scene__ball" style={layerStyle(parts.ball)} />
      </div>
    </div>
  );
}
