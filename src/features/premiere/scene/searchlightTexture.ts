import * as THREE from 'three';

/** The soft volumetric beam gradient used by both premiere searchlights. */
export function createSearchlightTexture(): THREE.CanvasTexture {
  const beamCanvas = document.createElement('canvas');
  beamCanvas.width = 128;
  beamCanvas.height = 256;
  const bCtx = beamCanvas.getContext('2d')!;
  const bGrad = bCtx.createLinearGradient(0, 0, 0, 256);
  bGrad.addColorStop(0.0, 'rgba(255, 226, 148, 0.0)');
  bGrad.addColorStop(0.25, 'rgba(255, 222, 138, 0.11)');
  bGrad.addColorStop(0.85, 'rgba(212, 165, 55, 0.03)');
  bGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  bCtx.fillStyle = bGrad;
  bCtx.fillRect(0, 0, 128, 256);

  bCtx.globalCompositeOperation = 'destination-in';
  const hGrad = bCtx.createLinearGradient(0, 0, 128, 0);
  hGrad.addColorStop(0.0, 'rgba(0,0,0,0)');
  hGrad.addColorStop(0.5, 'rgba(255,255,255,1)');
  hGrad.addColorStop(1.0, 'rgba(0,0,0,0)');
  bCtx.fillStyle = hGrad;
  bCtx.fillRect(0, 0, 128, 256);

  return new THREE.CanvasTexture(beamCanvas);
}
