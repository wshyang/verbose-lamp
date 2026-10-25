import * as THREE from 'three';

/**
 * The sweeping premiere searchlight cone, drawn once on a 2D canvas and reused by both
 * beams (ADDENDUM-022 §6.3 — moved out of the scene manager verbatim).
 */
export function createSearchlightTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const context = canvas.getContext('2d')!;

  const vertical = context.createLinearGradient(0, 0, 0, 256);
  vertical.addColorStop(0.0, 'rgba(255, 226, 148, 0.0)');
  vertical.addColorStop(0.25, 'rgba(255, 222, 138, 0.11)');
  vertical.addColorStop(0.85, 'rgba(212, 165, 55, 0.03)');
  vertical.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  context.fillStyle = vertical;
  context.fillRect(0, 0, 128, 256);

  // Soft horizontal falloff, so the cone has no hard edges across the stage.
  context.globalCompositeOperation = 'destination-in';
  const horizontal = context.createLinearGradient(0, 0, 128, 0);
  horizontal.addColorStop(0.0, 'rgba(0,0,0,0)');
  horizontal.addColorStop(0.5, 'rgba(255,255,255,1)');
  horizontal.addColorStop(1.0, 'rgba(0,0,0,0)');
  context.fillStyle = horizontal;
  context.fillRect(0, 0, 128, 256);

  return new THREE.CanvasTexture(canvas);
}
