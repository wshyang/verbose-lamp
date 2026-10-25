import * as THREE from 'three';

/**
 * The soft volumetric cone drawn once into a 128 × 256 canvas and used by both
 * premiere searchlights. Moved verbatim from `GatsbySceneManager` (ADDENDUM-022 §6
 * step 2.3): the gradient stops are the look, so they are copied exactly.
 */
export const SEARCHLIGHT_TEXTURE_WIDTH = 128;
export const SEARCHLIGHT_TEXTURE_HEIGHT = 256;

export function createSearchlightTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = SEARCHLIGHT_TEXTURE_WIDTH;
  canvas.height = SEARCHLIGHT_TEXTURE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);

  const vertical = context.createLinearGradient(0, 0, 0, SEARCHLIGHT_TEXTURE_HEIGHT);
  vertical.addColorStop(0.0, 'rgba(255, 226, 148, 0.0)');
  vertical.addColorStop(0.25, 'rgba(255, 222, 138, 0.11)');
  vertical.addColorStop(0.85, 'rgba(212, 165, 55, 0.03)');
  vertical.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  context.fillStyle = vertical;
  context.fillRect(0, 0, SEARCHLIGHT_TEXTURE_WIDTH, SEARCHLIGHT_TEXTURE_HEIGHT);

  // Soft horizontal falloff
  context.globalCompositeOperation = 'destination-in';
  const horizontal = context.createLinearGradient(0, 0, SEARCHLIGHT_TEXTURE_WIDTH, 0);
  horizontal.addColorStop(0.0, 'rgba(0,0,0,0)');
  horizontal.addColorStop(0.5, 'rgba(255,255,255,1)');
  horizontal.addColorStop(1.0, 'rgba(0,0,0,0)');
  context.fillStyle = horizontal;
  context.fillRect(0, 0, SEARCHLIGHT_TEXTURE_WIDTH, SEARCHLIGHT_TEXTURE_HEIGHT);

  return new THREE.CanvasTexture(canvas);
}
