import * as THREE from 'three';
import { buildEdgeBorder, viewportScaleAtDistance, type BaseGenome } from './frame';
import type { FrameSpec } from './frame';

export interface EdgeBorderOptions {
  camera: THREE.PerspectiveCamera;
  aspect: number;
  genome: BaseGenome;
  /** 0..1 ornament weight */
  weight: number;
  /** distance in front of the camera, in world units */
  distance?: number;
}

export interface EdgeBorderState {
  /** 0..1 — how many nested rules and how dense the reeding */
  weight: number;
  genome: BaseGenome;
}

/**
 * The poster's printed edge border as a persistent proscenium.
 *
 * Parented to the camera so it stays at the viewport edge through the whole
 * fly-through, and therefore belongs to no title card.
 */
export class EdgeBorderRig {
  readonly mesh: THREE.Mesh;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly distance: number;
  private aspect: number;
  private state: EdgeBorderState;

  constructor(options: EdgeBorderOptions) {
    this.camera = options.camera;
    this.aspect = options.aspect;
    this.distance = options.distance ?? 3;
    this.state = { weight: options.weight, genome: options.genome };
    this.material = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#f4c95d'),
      metalness: 0.96,
      roughness: 0.17,
      envMapIntensity: 2.1,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.buildGeometry(), this.material);
    this.mesh.renderOrder = 5;
    this.mesh.frustumCulled = false;
    this.applyCameraPlacement();
  }

  private buildGeometry(): THREE.BufferGeometry {
    const { specs } = buildEdgeBorder({
      aspect: this.aspect,
      genome: this.state.genome,
      density: this.state.weight,
    });
    return buildBufferGeometry(specs);
  }

  private applyCameraPlacement() {
    const scale = viewportScaleAtDistance(this.distance, THREE.MathUtils.degToRad(this.camera.fov));
    this.mesh.position.set(0, 0, -this.distance);
    this.mesh.scale.setScalar(scale);
  }

  get railCount(): number {
    return this.mesh.geometry.getAttribute('position').count / 6;
  }

  get isEnabled(): boolean {
    return this.mesh.visible;
  }

  setEnabled(enabled: boolean) {
    this.mesh.visible = enabled;
  }

  setState(state: EdgeBorderState) {
    const geometryChanged =
      state.weight !== this.state.weight || JSON.stringify(state.genome) !== JSON.stringify(this.state.genome);
    this.state = state;
    if (geometryChanged) {
      const previous = this.mesh.geometry;
      this.mesh.geometry = this.buildGeometry();
      previous.dispose();
    }
  }

  /** Rebuilds for a new viewport shape and re-derives the frustum scale. */
  setAspect(aspect: number, fovRadians: number) {
    if (Math.abs(aspect - this.aspect) < 1e-6) return;
    this.aspect = aspect;
    const previous = this.mesh.geometry;
    this.mesh.geometry = this.buildGeometry();
    previous.dispose();
    this.applyCameraPlacement();
    void fovRadians;
  }

  /** Fades the border in during the first moments of playback. */
  updateReveal(time: number) {
    this.material.opacity = this.mesh.visible ? Math.min(1, Math.max(0, (time - 0.4) / 1.4)) : 0;
    this.mesh.visible = this.material.opacity > 0.01 && this.mesh.visible;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}

/** Sweeps rails into one merged buffer; a flat face is enough at constant depth. */
function buildBufferGeometry(specs: FrameSpec[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const halfWidths = specs.map((spec) => spec.width / 2);
  let vertexBase = 0;

  specs.forEach((spec, specIndex) => {
    const half = halfWidths[specIndex];
    spec.points.forEach((point, index) => {
      const next = spec.points[(index + 1) % spec.points.length];
      const closed = Boolean(spec.closed) || index < spec.points.length - 1;
      if (!closed) return;
      const dx = next.x - point.x;
      const dy = next.y - point.y;
      const length = Math.hypot(dx, dy) || 1;
      const nx = (-dy / length) * half;
      const ny = (dx / length) * half;
      positions.push(point.x - nx, point.y - ny, spec.z, point.x + nx, point.y + ny, spec.z);
      if (index < spec.points.length - 1 || spec.closed) {
        const a = vertexBase + index * 2;
        const b = a + 1;
        const c = vertexBase + ((index + 1) % spec.points.length) * 2;
        const d = c + 1;
        indices.push(a, b, d, a, d, c);
      }
    });
    vertexBase += spec.points.length * 2;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}
