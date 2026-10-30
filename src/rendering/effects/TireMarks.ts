/**
 * Marcas de pneu: faixas contínuas gravadas em um buffer circular (sem alocações por quadro).
 * Só são geradas quando a física indica derrapagem real (intensidade de deslizamento da roda).
 */
import * as THREE from 'three';
import type { VehiclePhysics } from '../../vehicles/VehiclePhysics';

interface WheelTrail {
  last: THREE.Vector3;
  active: boolean;
}

export class TireMarks {
  readonly mesh: THREE.Mesh;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly geometry: THREE.BufferGeometry;
  private readonly capacity: number;
  private cursor = 0;
  private filled = 0;
  private readonly trails = new Map<string, WheelTrail[]>();
  private readonly dir = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly point = new THREE.Vector3();
  private dirtyFrom = Infinity;
  private dirtyTo = -1;

  constructor(texture: THREE.Texture, capacity: number) {
    this.capacity = Math.max(64, capacity);
    this.positions = new Float32Array(this.capacity * 4 * 3);
    this.colors = new Float32Array(this.capacity * 4 * 4);
    const uvs = new Float32Array(this.capacity * 4 * 2);
    const indices = new Uint32Array(this.capacity * 6);
    for (let i = 0; i < this.capacity; i++) {
      const v = i * 4;
      uvs.set([0, 0, 1, 0, 0, 1, 1, 1], v * 2);
      indices.set([v, v + 2, v + 1, v + 1, v + 2, v + 3], i * 6);
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 4).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    this.geometry.setDrawRange(0, 0);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color: 0x0a0a0a,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -8,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.name = 'tire-marks';
  }

  clear(): void {
    this.cursor = 0;
    this.filled = 0;
    this.geometry.setDrawRange(0, 0);
    for (const trails of this.trails.values()) for (const t of trails) t.active = false;
  }

  private addSegment(from: THREE.Vector3, to: THREE.Vector3, normal: THREE.Vector3, width: number, alpha: number): void {
    this.dir.subVectors(to, from);
    const len = this.dir.length();
    if (len < 1e-3) return;
    this.dir.divideScalar(len);
    this.side.crossVectors(this.dir, normal).normalize().multiplyScalar(width / 2);
    const i = this.cursor;
    const p = this.positions;
    const base = i * 12;
    p[base] = from.x - this.side.x;
    p[base + 1] = from.y - this.side.y;
    p[base + 2] = from.z - this.side.z;
    p[base + 3] = from.x + this.side.x;
    p[base + 4] = from.y + this.side.y;
    p[base + 5] = from.z + this.side.z;
    p[base + 6] = to.x - this.side.x;
    p[base + 7] = to.y - this.side.y;
    p[base + 8] = to.z - this.side.z;
    p[base + 9] = to.x + this.side.x;
    p[base + 10] = to.y + this.side.y;
    p[base + 11] = to.z + this.side.z;
    const c = this.colors;
    const cb = i * 16;
    for (let k = 0; k < 4; k++) {
      c[cb + k * 4] = 1;
      c[cb + k * 4 + 1] = 1;
      c[cb + k * 4 + 2] = 1;
      c[cb + k * 4 + 3] = alpha;
    }
    this.dirtyFrom = Math.min(this.dirtyFrom, i);
    this.dirtyTo = Math.max(this.dirtyTo, i);
    this.cursor = (this.cursor + 1) % this.capacity;
    this.filled = Math.min(this.capacity, this.filled + 1);
  }

  update(id: string, vehicle: VehiclePhysics): void {
    let trails = this.trails.get(id);
    if (!trails) {
      trails = vehicle.wheels.map(() => ({ last: new THREE.Vector3(), active: false }));
      this.trails.set(id, trails);
    }
    for (let i = 0; i < vehicle.wheels.length; i++) {
      const wheel = vehicle.wheels[i];
      const trail = trails[i];
      const marking = wheel.grounded && wheel.skid > 0.22 && (wheel.surface === 'asphalt' || wheel.surface === 'curb');
      if (!marking) {
        trail.active = false;
        continue;
      }
      this.point.copy(wheel.contactPoint).addScaledVector(wheel.contactNormal, 0.015);
      if (!trail.active) {
        trail.last.copy(this.point);
        trail.active = true;
        continue;
      }
      if (trail.last.distanceToSquared(this.point) > 0.35 * 0.35) {
        if (trail.last.distanceToSquared(this.point) < 9) {
          this.addSegment(trail.last, this.point, wheel.contactNormal, wheel.width * 0.9, Math.min(0.85, wheel.skid * 0.9));
        }
        trail.last.copy(this.point);
      }
    }
  }

  /** Envia apenas a faixa alterada para a GPU. */
  flush(): void {
    if (this.dirtyTo < 0) return;
    const pos = this.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.geometry.attributes.color as THREE.BufferAttribute;
    if (this.dirtyFrom <= this.dirtyTo) {
      pos.clearUpdateRanges();
      col.clearUpdateRanges();
      pos.addUpdateRange(this.dirtyFrom * 12, (this.dirtyTo - this.dirtyFrom + 1) * 12);
      col.addUpdateRange(this.dirtyFrom * 16, (this.dirtyTo - this.dirtyFrom + 1) * 16);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.geometry.setDrawRange(0, this.filled * 6);
    this.dirtyFrom = Infinity;
    this.dirtyTo = -1;
  }

  dispose(): void {
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.removeFromParent();
  }
}
