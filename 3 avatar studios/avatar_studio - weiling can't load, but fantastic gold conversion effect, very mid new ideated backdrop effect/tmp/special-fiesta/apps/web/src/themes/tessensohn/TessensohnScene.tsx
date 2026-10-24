import { useEffect, useState, useSyncExternalStore } from 'react';
import { SCENE_VERSION } from './art/sceneVersion.js';
import {
  COURT_FRAME,
  SCENE_BASE,
  SCENE_NODES,
  WIDE_NODES,
  type SceneGroup,
  type SceneLayer,
  type SceneNode,
} from './sceneLayers.js';

/**
 * The CSC @ Tessensohn backdrop (ADR-299): the Civil Service Club's own About-page banner, as
 * stacked <img> layers positioned in percentages of one plate and animated by CSS alone
 * (`scene.css`). Provenance and permission: docs/design/tessensohn-scene-credits.md.
 *
 * Decoration, like every backdrop (ADR-014): `aria-hidden`, pointer-events free, participant-only.
 *
 * TWO COMPOSITIONS, because CSC drew two. On a portrait screen the scene is CSC's phone banner, a
 * 445 x 671 plate that is never cropped (`data-fit="plate"`, ADR-298). On a landscape screen it is
 * CSC's desktop banner, a 3259 x 1204 strip pinned to the bottom and filling the width like
 * Sentosa's (`data-layout="wide"`, no `data-fit`). Showing the phone plate on a desktop left the
 * art in a narrow column with flat colour either side. A venue with one art style has no
 * classic/fine/real choice to dispatch on, so `?backdrop=` is ignored here.
 *
 * ENTRANCES. Every route renders its own scene, so the building rising and the car arriving would
 * replay on every tap. They play once per page load: the first scene to mount says
 * `data-intro="play"`, every later one `rest`, and at rest the building stands and the car is
 * parked. A reload is a new page load and plays them again.
 */

let introSpent = false;

/** Test seam: forget that the entrances have played, as a fresh page load would. */
export function resetIntro(): void {
  introSpent = false;
}

function useIntro(): 'play' | 'rest' {
  // The initialiser may run twice in development; both runs see "not spent" and agree.
  const [intro] = useState<'play' | 'rest'>(() => (introSpent ? 'rest' : 'play'));
  useEffect(() => {
    introSpent = true;
  }, []);
  return intro;
}

const LANDSCAPE = '(min-aspect-ratio: 1/1)';

function subscribeLandscape(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(LANDSCAPE);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function isLandscape(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(LANDSCAPE).matches;
}

/** Which of CSC's two compositions fits this screen, kept current as it rotates or resizes. */
function useLayout(): 'phone' | 'wide' {
  return useSyncExternalStore(subscribeLandscape, isLandscape, () => false) ? 'wide' : 'phone';
}

const cls = (name: string | null): string | undefined => (name === null ? undefined : `csc-${name}`);

function Layer({ layer }: { readonly layer: SceneLayer }) {
  return (
    <img
      className={cls(layer.cls)}
      src={`${SCENE_BASE}/${layer.file}?v=${SCENE_VERSION}`}
      alt=""
      draggable={false}
    />
  );
}

/** A character or prop cut into parts: the first layer sizes the box, the rest are laid over it. */
function Group({ group, testId }: { readonly group: SceneGroup; readonly testId?: string }) {
  return (
    <div className={`csc-${group.name}`} data-testid={testId}>
      <div className="csc-img-wrapper">
        {group.layers.map((layer) => (
          <Layer key={`${layer.file}:${layer.cls ?? ''}`} layer={layer} />
        ))}
      </div>
    </div>
  );
}

function Court() {
  return (
    <div className="csc-court" data-testid="venue-scene__court">
      <div className="csc-img-wrapper csc-court-frame">
        {COURT_FRAME.map((part) =>
          'kind' in part ? (
            <Group key={part.name} group={part} />
          ) : (
            <Layer key={part.file} layer={part} />
          ),
        )}
      </div>
    </div>
  );
}

function renderNode(node: SceneNode, index: number) {
  if (node.kind === 'court') return <Court key="court" />;
  if (node.kind === 'group') return <Group key={node.name} group={node} testId={`venue-scene__${node.name}`} />;
  return <Layer key={`${node.cls}:${index}`} layer={node} />;
}

export function TessensohnScene() {
  const intro = useIntro();
  const layout = useLayout();
  return (
    <div
      className="gb-scene venue-scene--tessensohn"
      aria-hidden="true"
      data-fit={layout === 'phone' ? 'plate' : undefined}
      data-layout={layout}
      data-intro={intro}
      data-testid="venue-scene"
    >
      {(layout === 'phone' ? SCENE_NODES : WIDE_NODES).map(renderNode)}
    </div>
  );
}
