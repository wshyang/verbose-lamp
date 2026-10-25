/**
 * Recorded debt against the CLAUDE.md hard limits (ADDENDUM-034).
 *
 * This is a ratchet, not an allowance: `src/discipline.test.ts` asserts that no
 * function in the tree exceeds the recorded size, that no *new* function appears
 * here, and that every entry still exists. The table can only shrink — fixing a
 * function means lowering its numbers or deleting its row, never adding one.
 *
 * Measured with the TypeScript parser, so comments and blank lines count the same
 * way everywhere.
 */

export type DebtReason = 'component' | 'render-rig' | 'geometry-primitive' | 'feature-hook' | 'logic-orchestrator';

export const REASON_TEXT: Record<DebtReason, string> = {
  component:
    'A React component: it renders a subtree and holds no state machine. Splitting it would add prop plumbing and a test id without removing a decision (CLAUDE.md §3 keeps components dumb).',
  'render-rig':
    'A three.js rig from the original import. Its behaviour is pinned by geometry goldens and, since ADDENDUM-029, by headless scene tests. Split when next touched substantively (ADDENDUM-001 §4).',
  'geometry-primitive':
    'A geometry primitive whose parameters are drawing coordinates. A single options object would rename every call site and hide the coordinates being passed; the length is the shape of the drawing, not tangled control flow.',
  'feature-hook':
    'A feature hook that composes several domains (session, analysis, export). Linear, and each phase has its own tests; splitting it would only move the composition elsewhere.',
  'logic-orchestrator':
    'A linear orchestrator left from the original import. Pure code motion is safe here but has not been the highest-value work; recorded so it cannot grow.',
};

export interface DebtEntry {
  readonly file: string;
  readonly name: string;
  /** Ceiling, not the current value: the function may shrink without touching this row. */
  readonly maxLines: number;
  readonly maxParams: number;
  readonly maxDepth: number;
  readonly reason: DebtReason;
}

export const DISCIPLINE_DEBT: readonly DebtEntry[] = [
  { file: 'src/app/components/PremiereHeader.tsx', name: 'PremiereHeader', maxLines: 74, maxParams: 1, maxDepth: 0, reason: 'component' },
  { file: 'src/app/components/PremiereSurfaces.tsx', name: 'PremiereSurfaces', maxLines: 75, maxParams: 1, maxDepth: 0, reason: 'component' },
  { file: 'src/app/components/PremiereTimeline.tsx', name: 'PremiereTimeline', maxLines: 85, maxParams: 1, maxDepth: 0, reason: 'component' },
  { file: 'src/features/art-deco-frame/engine/frameGrammar/archetypes.ts', name: 'buildCoreFrameSpecs', maxLines: 292, maxParams: 3, maxDepth: 6, reason: 'logic-orchestrator' },
  { file: 'src/features/art-deco-frame/engine/frameGrammar/edgeBorder.ts', name: 'arcPoints', maxLines: 7, maxParams: 4, maxDepth: 0, reason: 'geometry-primitive' },
  { file: 'src/features/art-deco-frame/engine/frameGrammar/edgeBorder.ts', name: 'rail', maxLines: 11, maxParams: 7, maxDepth: 0, reason: 'geometry-primitive' },
  { file: 'src/features/art-deco-frame/engine/frameGrammar/edgeBorder.ts', name: 'reeding', maxLines: 62, maxParams: 3, maxDepth: 2, reason: 'logic-orchestrator' },
  { file: 'src/features/art-deco-frame/engine/frameGrammar/generative.ts', name: 'buildFractal', maxLines: 56, maxParams: 2, maxDepth: 1, reason: 'logic-orchestrator' },
  { file: 'src/features/art-deco-frame/engine/frameGrammar/generative.ts', name: 'buildGenerativeFrameSpecs', maxLines: 29, maxParams: 4, maxDepth: 1, reason: 'geometry-primitive' },
  { file: 'src/features/art-deco-frame/engine/frameGrammar/generative.ts', name: 'primaryHalfRing', maxLines: 17, maxParams: 4, maxDepth: 0, reason: 'geometry-primitive' },
  { file: 'src/features/art-deco-frame/engine/frameGrammar/generative.ts', name: 'rail', maxLines: 10, maxParams: 6, maxDepth: 0, reason: 'geometry-primitive' },
  { file: 'src/features/art-deco-frame/engine/frameGrammar/generative.ts', name: 'withMonogram', maxLines: 12, maxParams: 4, maxDepth: 1, reason: 'geometry-primitive' },
  { file: 'src/features/art-deco-frame/engine/frameGrammar/index.ts', name: 'buildAuthoredFrame', maxLines: 8, maxParams: 4, maxDepth: 0, reason: 'geometry-primitive' },
  { file: 'src/features/art-deco-frame/engine/frameGrammar/primitives.ts', name: 'addChevronWings', maxLines: 35, maxParams: 11, maxDepth: 2, reason: 'geometry-primitive' },
  { file: 'src/features/art-deco-frame/engine/frameGrammar/primitives.ts', name: 'addCutOctagon', maxLines: 25, maxParams: 9, maxDepth: 1, reason: 'geometry-primitive' },
  { file: 'src/features/art-deco-frame/engine/frameGrammar/primitives.ts', name: 'addDiamond', maxLines: 28, maxParams: 10, maxDepth: 0, reason: 'geometry-primitive' },
  { file: 'src/features/art-deco-frame/engine/frameGrammar/primitives.ts', name: 'addSplitRule', maxLines: 35, maxParams: 8, maxDepth: 0, reason: 'geometry-primitive' },
  { file: 'src/features/art-deco-frame/engine/frameGrammar/primitives.ts', name: 'addSunburstFan', maxLines: 57, maxParams: 13, maxDepth: 1, reason: 'logic-orchestrator' },
  { file: 'src/features/art-deco-frame/engine/frameGrammar/primitives.ts', name: 'addZigguratFrame', maxLines: 33, maxParams: 9, maxDepth: 2, reason: 'geometry-primitive' },
  { file: 'src/features/art-deco-frame/engine/frameGrammar/primitives.ts', name: 'octagonHalf', maxLines: 39, maxParams: 5, maxDepth: 1, reason: 'geometry-primitive' },
  { file: 'src/features/art-deco-frame/render/ScreenBorderRig.ts', name: 'createScreenBorderRig', maxLines: 101, maxParams: 3, maxDepth: 1, reason: 'render-rig' },
  { file: 'src/features/art-deco-frame/render/railGeometry.ts', name: 'appendChamferedPolyline', maxLines: 145, maxParams: 2, maxDepth: 3, reason: 'render-rig' },
  { file: 'src/features/avatar-studio/components/BackdropControls.tsx', name: 'BackdropControls', maxLines: 60, maxParams: 1, maxDepth: 0, reason: 'component' },
  { file: 'src/features/avatar-studio/components/PhotoCropper.tsx', name: 'PhotoCropper', maxLines: 59, maxParams: 1, maxDepth: 0, reason: 'component' },
  { file: 'src/features/avatar-studio/hooks/usePhotoSession.ts', name: 'usePhotoSession', maxLines: 74, maxParams: 0, maxDepth: 2, reason: 'feature-hook' },
  { file: 'src/features/background-removal/fixtures.ts', name: 'buildHawkerMatte', maxLines: 11, maxParams: 0, maxDepth: 4, reason: 'logic-orchestrator' },
  { file: 'src/features/deco-lattice/model/nineSlice.ts', name: 'box', maxLines: 14, maxParams: 5, maxDepth: 0, reason: 'geometry-primitive' },
  { file: 'src/features/deco-lattice/model/nineSlice.ts', name: 'corners', maxLines: 7, maxParams: 5, maxDepth: 0, reason: 'geometry-primitive' },
  { file: 'src/features/deco-lattice/model/nineSlice.ts', name: 'edgeBand', maxLines: 13, maxParams: 5, maxDepth: 1, reason: 'geometry-primitive' },
  { file: 'src/features/deco-lattice/model/nineSlice.ts', name: 'rail', maxLines: 9, maxParams: 5, maxDepth: 0, reason: 'geometry-primitive' },
  { file: 'src/features/deco-lattice/model/walk.ts', name: 'stepRun', maxLines: 17, maxParams: 5, maxDepth: 2, reason: 'geometry-primitive' },
  { file: 'src/features/event-night/components/EventNightStage.tsx', name: 'EventNightStage', maxLines: 51, maxParams: 1, maxDepth: 0, reason: 'component' },
  { file: 'src/features/frame-studio/components/FrameStudioControl.tsx', name: 'FrameStudioControl', maxLines: 291, maxParams: 1, maxDepth: 1, reason: 'component' },
  { file: 'src/features/frame-studio/hooks/useFrameStudio.ts', name: 'useFrameStudio', maxLines: 211, maxParams: 1, maxDepth: 1, reason: 'feature-hook' },
  { file: 'src/features/gilded-portrait/curve.ts', name: 'endpointSlope', maxLines: 6, maxParams: 4, maxDepth: 1, reason: 'geometry-primitive' },
  { file: 'src/features/gilded-portrait/curve.ts', name: 'interiorTangent', maxLines: 6, maxParams: 4, maxDepth: 1, reason: 'geometry-primitive' },
  { file: 'src/features/gilded-portrait/curve.ts', name: 'interpolateSegment', maxLines: 11, maxParams: 5, maxDepth: 0, reason: 'geometry-primitive' },
  { file: 'src/features/gilded-portrait/mask.ts', name: 'ovalDistance', maxLines: 7, maxParams: 4, maxDepth: 0, reason: 'geometry-primitive' },
  { file: 'src/features/gilded-portrait/mask.ts', name: 'roundedRectDistance', maxLines: 10, maxParams: 4, maxDepth: 0, reason: 'geometry-primitive' },
  { file: 'src/features/premiere/hooks/usePremiereController.ts', name: 'usePremiereController', maxLines: 71, maxParams: 0, maxDepth: 1, reason: 'feature-hook' },
  { file: 'src/features/premiere/hooks/usePremiereRuntime.ts', name: 'usePremiereRuntime', maxLines: 55, maxParams: 1, maxDepth: 1, reason: 'feature-hook' },
  { file: 'src/features/premiere/scene/decoCards.ts', name: 'createGatsbyCardRig', maxLines: 193, maxParams: 2, maxDepth: 2, reason: 'render-rig' },
  { file: 'src/features/premiere/scene/environment.ts', name: 'createBallroomEnvironment', maxLines: 84, maxParams: 1, maxDepth: 3, reason: 'render-rig' },
  { file: 'src/features/premiere/scene/environment.ts', name: 'createDecoWallpaperTextures', maxLines: 176, maxParams: 0, maxDepth: 2, reason: 'render-rig' },
  { file: 'src/features/premiere/scene/styleClamp.ts', name: 'clampOr', maxLines: 3, maxParams: 4, maxDepth: 0, reason: 'geometry-primitive' },
  { file: 'src/features/premiere/scene3d/CinemaCamera.tsx', name: 'CinemaCamera', maxLines: 63, maxParams: 1, maxDepth: 1, reason: 'component' },
  { file: 'src/features/premiere/scene3d/Searchlights.tsx', name: 'Searchlights', maxLines: 54, maxParams: 1, maxDepth: 1, reason: 'component' },
  { file: 'src/features/premiere/scene3d/composer.ts', name: 'createCinemaComposer', maxLines: 42, maxParams: 5, maxDepth: 0, reason: 'geometry-primitive' },
  { file: 'src/features/premiere/scene3d/pointerAim.ts', name: 'normalisePointer', maxLines: 6, maxParams: 4, maxDepth: 0, reason: 'geometry-primitive' },
  { file: 'src/features/qr-generator/GoldenQrCode.tsx', name: 'bracketPath', maxLines: 3, maxParams: 4, maxDepth: 0, reason: 'geometry-primitive' },
  { file: 'src/features/qr-generator/GoldenQrDefs.tsx', name: 'GoldenQrDefs', maxLines: 55, maxParams: 1, maxDepth: 0, reason: 'component' },
  { file: 'src/features/qr-generator/geometry.ts', name: 'chamferedSquarePath', maxLines: 9, maxParams: 4, maxDepth: 0, reason: 'geometry-primitive' },
  { file: 'src/features/qr-generator/useQrGenerator.ts', name: 'useQrGenerator', maxLines: 61, maxParams: 0, maxDepth: 1, reason: 'feature-hook' },
  { file: 'src/features/research/components/ResearchModal.tsx', name: 'ResearchModal', maxLines: 161, maxParams: 1, maxDepth: 1, reason: 'component' },
  { file: 'src/features/spectacle-preview/testing/stubPreview.ts', name: 'stubPreview', maxLines: 56, maxParams: 1, maxDepth: 0, reason: 'logic-orchestrator' },
  { file: 'src/features/spectacle/effects/sparklers/sparklerRenderer.ts', name: 'drawSparklerSmoke', maxLines: 16, maxParams: 5, maxDepth: 1, reason: 'geometry-primitive' },
  { file: 'src/features/spectacle/effects/sparklers/sparklersEffect.ts', name: 'emitForPlan', maxLines: 7, maxParams: 5, maxDepth: 1, reason: 'geometry-primitive' },
  { file: 'src/features/title-customizer/components/CustomTitleModal.tsx', name: 'CustomTitleModal', maxLines: 182, maxParams: 1, maxDepth: 1, reason: 'component' },
  { file: 'src/shared/ui/Dialog.tsx', name: 'Dialog', maxLines: 72, maxParams: 1, maxDepth: 2, reason: 'component' },
];
