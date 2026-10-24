import * as THREE from 'three';

/**
 * Generates a high-contrast Art Deco Grand Ballroom & Studio Softbox
 * equirectangular environment texture so metallic 24k gold and platinum
 * surfaces exhibit rich, realistic anisotropic-like specular reflections.
 */
export function createBallroomEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Base vertical gradient: warm chandelier ceiling -> obsidian horizon -> warm brass floor bounce
  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0.0, '#3a2910');
  bgGrad.addColorStop(0.22, '#1a1308');
  bgGrad.addColorStop(0.48, '#060509');
  bgGrad.addColorStop(0.55, '#09080d');
  bgGrad.addColorStop(0.82, '#241809');
  bgGrad.addColorStop(1.0, '#120c05');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Studio softbox strips & Art Deco ballroom colonnade light pillars
  // Sharp bright strips alternating with dark gaps are essential for crisp metallic edge glints!
  for (let i = 0; i < 16; i++) {
    const x = (i / 16) * width;
    const w = i % 2 === 0 ? 22 : 10;
    const pillarGrad = ctx.createLinearGradient(x, 40, x, height - 40);
    if (i % 4 === 0) {
      // Bright champagne-white key strip
      pillarGrad.addColorStop(0.0, 'rgba(255, 248, 225, 0.0)');
      pillarGrad.addColorStop(0.25, 'rgba(255, 246, 214, 0.95)');
      pillarGrad.addColorStop(0.5, 'rgba(255, 232, 175, 1.0)');
      pillarGrad.addColorStop(0.75, 'rgba(245, 198, 105, 0.85)');
      pillarGrad.addColorStop(1.0, 'rgba(245, 198, 105, 0.0)');
    } else if (i % 4 === 2) {
      // Rich 24k amber fill strip
      pillarGrad.addColorStop(0.0, 'rgba(212, 175, 55, 0.0)');
      pillarGrad.addColorStop(0.3, 'rgba(235, 185, 72, 0.7)');
      pillarGrad.addColorStop(0.7, 'rgba(195, 138, 34, 0.65)');
      pillarGrad.addColorStop(1.0, 'rgba(212, 175, 55, 0.0)');
    } else {
      // Cool midnight sapphire contrast accent (makes silver/platinum pop!)
      pillarGrad.addColorStop(0.0, 'rgba(120, 165, 225, 0.0)');
      pillarGrad.addColorStop(0.45, 'rgba(155, 195, 245, 0.32)');
      pillarGrad.addColorStop(0.65, 'rgba(110, 150, 210, 0.25)');
      pillarGrad.addColorStop(1.0, 'rgba(120, 165, 225, 0.0)');
    }
    ctx.fillStyle = pillarGrad;
    ctx.fillRect(x, 20, w, height - 40);
  }

  // Overhead Art Deco chandelier medallions
  for (let c = 0; c < 5; c++) {
    const cx = ((c + 0.5) / 5) * width;
    const cy = height * 0.16;
    const rad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 95);
    rad.addColorStop(0.0, 'rgba(255, 252, 240, 1.0)');
    rad.addColorStop(0.3, 'rgba(255, 225, 145, 0.75)');
    rad.addColorStop(0.7, 'rgba(198, 142, 42, 0.2)');
    rad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = rad;
    ctx.beginPath();
    ctx.arc(cx, cy, 95, 0, Math.PI * 2);
    ctx.fill();
  }

  // Crisp horizon specular ribbon
  const horizonGrad = ctx.createLinearGradient(0, height * 0.47, 0, height * 0.53);
  horizonGrad.addColorStop(0.0, 'rgba(255, 236, 178, 0.0)');
  horizonGrad.addColorStop(0.5, 'rgba(255, 244, 208, 0.65)');
  horizonGrad.addColorStop(1.0, 'rgba(255, 236, 178, 0.0)');
  ctx.fillStyle = horizonGrad;
  ctx.fillRect(0, height * 0.47, width, height * 0.06);

  const equirectTex = new THREE.CanvasTexture(canvas);
  equirectTex.mapping = THREE.EquirectangularReflectionMapping;
  equirectTex.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envRT = pmrem.fromEquirectangular(equirectTex);
  equirectTex.dispose();
  pmrem.dispose();

  return envRT.texture;
}

export interface WallpaperTextures {
  map: THREE.CanvasTexture;
  normalMap: THREE.DataTexture;
  roughnessMap: THREE.CanvasTexture;
}

/**
 * Synthesizes a seamlessly tileable Art Deco tessellated fan & diamond lattice
 * bas-relief texture set (inspired by Catherine Martin & Silvana Azzi Heras's
 * Gatsby wallpaper and Deva Studios' tessellated background).
 */
export function createDecoWallpaperTextures(): WallpaperTextures {
  const size = 512;

  // 1. Heightfield canvas for normal + roughness + albedo derivation
  const hCanvas = document.createElement('canvas');
  hCanvas.width = size;
  hCanvas.height = size;
  const hCtx = hCanvas.getContext('2d')!;

  hCtx.fillStyle = '#141414';
  hCtx.fillRect(0, 0, size, size);

  const drawDecoFanCell = (cx: number, cy: number, r: number) => {
    // Stepped concentric Art Deco fan arches + diamond keystone
    hCtx.save();
    hCtx.beginPath();
    hCtx.arc(cx, cy + r * 0.45, r, Math.PI * 1.08, Math.PI * 1.92);
    hCtx.lineTo(cx, cy + r * 0.45);
    hCtx.closePath();
    hCtx.fillStyle = '#1c1c1c';
    hCtx.fill();

    // Radial ribs
    hCtx.strokeStyle = '#c8c8c8';
    hCtx.lineWidth = 3.5;
    const rays = 9;
    for (let i = 0; i <= rays; i++) {
      const a = Math.PI * 1.1 + (i / rays) * (Math.PI * 0.8);
      hCtx.beginPath();
      hCtx.moveTo(cx, cy + r * 0.45);
      hCtx.lineTo(cx + Math.cos(a) * r, cy + r * 0.45 + Math.sin(a) * r);
      hCtx.stroke();
    }

    // Concentric rings
    for (const frac of [0.98, 0.84, 0.56, 0.3]) {
      hCtx.beginPath();
      hCtx.arc(cx, cy + r * 0.45, r * frac, Math.PI * 1.06, Math.PI * 1.94);
      hCtx.strokeStyle = frac > 0.8 ? '#f0f0f0' : '#9e9e9e';
      hCtx.lineWidth = frac > 0.8 ? 4.5 : 2.5;
      hCtx.stroke();
    }

    // Central diamond accent
    hCtx.beginPath();
    hCtx.moveTo(cx, cy - r * 0.48);
    hCtx.lineTo(cx + r * 0.14, cy - r * 0.32);
    hCtx.lineTo(cx, cy - r * 0.16);
    hCtx.lineTo(cx - r * 0.14, cy - r * 0.32);
    hCtx.closePath();
    hCtx.strokeStyle = '#ffffff';
    hCtx.lineWidth = 3;
    hCtx.stroke();
    hCtx.restore();
  };

  const cols = 4;
  const rows = 4;
  const cellW = size / cols;
  const cellH = size / rows;

  for (let row = -1; row <= rows + 1; row++) {
    for (let col = -1; col <= cols + 1; col++) {
      const offset = (row % 2) * (cellW * 0.5);
      const cx = col * cellW + offset;
      const cy = row * cellH;
      drawDecoFanCell(cx, cy, cellW * 0.62);
    }
  }

  // Fine geometric cross-lattice overlay
  hCtx.strokeStyle = 'rgba(220, 220, 220, 0.55)';
  hCtx.lineWidth = 2;
  for (let i = -size; i < size * 2; i += cellW) {
    hCtx.beginPath();
    hCtx.moveTo(i, 0);
    hCtx.lineTo(i + size, size);
    hCtx.stroke();

    hCtx.beginPath();
    hCtx.moveTo(i + size, 0);
    hCtx.lineTo(i, size);
    hCtx.stroke();
  }

  const hData = hCtx.getImageData(0, 0, size, size).data;

  // 2. Compute tangent-space normal map via Sobel filter
  const normalBytes = new Uint8Array(size * size * 4);
  const sampleH = (x: number, y: number) => {
    const wx = ((x % size) + size) % size;
    const wy = ((y % size) + size) % size;
    return hData[(wy * size + wx) * 4] / 255;
  };

  const strength = 3.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = sampleH(x - 1, y - 1);
      const t = sampleH(x, y - 1);
      const tr = sampleH(x + 1, y - 1);
      const l = sampleH(x - 1, y);
      const r = sampleH(x + 1, y);
      const bl = sampleH(x - 1, y + 1);
      const b = sampleH(x, y + 1);
      const br = sampleH(x + 1, y + 1);

      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;

      const nx = -dx;
      const ny = dy;
      const nz = 1.0;
      const invLen = 1.0 / Math.sqrt(nx * nx + ny * ny + nz * nz);

      const idx = (y * size + x) * 4;
      normalBytes[idx] = Math.round((nx * invLen * 0.5 + 0.5) * 255);
      normalBytes[idx + 1] = Math.round((ny * invLen * 0.5 + 0.5) * 255);
      normalBytes[idx + 2] = Math.round((nz * invLen * 0.5 + 0.5) * 255);
      normalBytes[idx + 3] = 255;
    }
  }

  const normalMap = new THREE.DataTexture(normalBytes, size, size, THREE.RGBAFormat);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(7, 4);
  normalMap.needsUpdate = true;

  // 3. Albedo map (deep obsidian recessed velvet + subtle antique bronze gilded ridges)
  const aCanvas = document.createElement('canvas');
  aCanvas.width = size;
  aCanvas.height = size;
  const aCtx = aCanvas.getContext('2d')!;
  const aImg = aCtx.createImageData(size, size);

  // 4. Roughness map (velvet matte recessed background, satin-metallic raised filigree)
  const rCanvas = document.createElement('canvas');
  rCanvas.width = size;
  rCanvas.height = size;
  const rCtx = rCanvas.getContext('2d')!;
  const rImg = rCtx.createImageData(size, size);

  for (let i = 0; i < size * size; i++) {
    const h = hData[i * 4] / 255;
    const ridge = Math.max(0, (h - 0.15) / 0.85);

    // Obsidian (#08070c) -> Dark Antique Gold (#6a4f1b)
    aImg.data[i * 4] = Math.round(8 + ridge * 98);
    aImg.data[i * 4 + 1] = Math.round(7 + ridge * 73);
    aImg.data[i * 4 + 2] = Math.round(12 + ridge * 22);
    aImg.data[i * 4 + 3] = 255;

    const rough = Math.round((0.88 - ridge * 0.56) * 255);
    rImg.data[i * 4] = rough;
    rImg.data[i * 4 + 1] = rough;
    rImg.data[i * 4 + 2] = rough;
    rImg.data[i * 4 + 3] = 255;
  }

  aCtx.putImageData(aImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  const map = new THREE.CanvasTexture(aCanvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(7, 4);
  map.colorSpace = THREE.SRGBColorSpace;

  const roughnessMap = new THREE.CanvasTexture(rCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(7, 4);

  return { map, normalMap, roughnessMap };
}
