/**
 * The volumetric searchlight cone texture, moved verbatim out of
 * `GatsbySceneManager.buildAtmosphericWorld` (ADDENDUM-022 §2.3).
 */
export const BEAM_CANVAS = { width: 128, height: 256 } as const;

export function createSearchlightTexture(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = BEAM_CANVAS.width;
  canvas.height = BEAM_CANVAS.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const vertical = ctx.createLinearGradient(0, 0, 0, BEAM_CANVAS.height);
  vertical.addColorStop(0.0, 'rgba(255, 226, 148, 0.0)');
  vertical.addColorStop(0.25, 'rgba(255, 222, 138, 0.11)');
  vertical.addColorStop(0.85, 'rgba(212, 165, 55, 0.03)');
  vertical.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = vertical;
  ctx.fillRect(0, 0, BEAM_CANVAS.width, BEAM_CANVAS.height);

  // Soft horizontal falloff
  ctx.globalCompositeOperation = 'destination-in';
  const horizontal = ctx.createLinearGradient(0, 0, BEAM_CANVAS.width, 0);
  horizontal.addColorStop(0.0, 'rgba(0,0,0,0)');
  horizontal.addColorStop(0.5, 'rgba(255,255,255,1)');
  horizontal.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = horizontal;
  ctx.fillRect(0, 0, BEAM_CANVAS.width, BEAM_CANVAS.height);
  return canvas;
}
