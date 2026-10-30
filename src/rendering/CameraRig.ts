/**
 * Câmeras da corrida.
 * - Perseguição (próxima/distante): suavização no referencial do carro (sem atraso em alta velocidade),
 *   leve alinhamento com a direção do movimento (mostra o drift), FOV dinâmico e anticolisão.
 * - Capô e cockpit: presas ao carro.
 * - Cinematográfica: câmeras posicionadas ao longo da pista com zoom adaptativo.
 * - Órbita: apresentação antes da largada e tela de resultados.
 */
import * as THREE from 'three';
import { QueryGroups } from '../physics/CollisionLayers';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { CameraView } from '../persistence/SaveSchema';
import type { Track } from '../tracks/Track';
import { clamp, dampFactor, smoothstep, wrappedDelta } from '../utils/math';
import type { VehicleModel } from './VehicleModelFactory';

export const CAMERA_VIEWS: CameraView[] = ['chase', 'chaseFar', 'hood', 'cockpit', 'cinematic'];
export const CAMERA_LABELS: Record<CameraView, string> = {
  chase: 'Perseguição próxima',
  chaseFar: 'Perseguição distante',
  hood: 'Capô',
  cockpit: 'Cockpit',
  cinematic: 'Cinematográfica',
};

export interface CameraTarget {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  velocity: THREE.Vector3;
  forwardSpeed: number;
  topSpeed: number;
  model: VehicleModel;
  /** Rugosidade da superfície sob o carro (0..1), para vibração. */
  roughness: number;
}

export interface CameraSettings {
  distance: number;
  height: number;
  fov: number;
  shake: number;
}

interface TrackCamera {
  s: number;
  position: THREE.Vector3;
}

const UP = new THREE.Vector3(0, 1, 0);

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  view: CameraView = 'chase';
  mode: 'drive' | 'orbit' = 'drive';
  settings: CameraSettings = { distance: 1, height: 1, fov: 68, shake: 0.6 };

  private readonly yawDir = new THREE.Vector3(0, 0, 1);
  private readonly offset = new THREE.Vector3(0, 2, -6);
  private readonly look = new THREE.Vector3();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpC = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private shakeEnergy = 0;
  private time = 0;
  private orbitAngle = 0;
  private trackCameras: TrackCamera[] = [];
  private cinematicIndex = -1;
  private initialized = false;
  private physics: PhysicsWorld | null = null;
  private track: Track | null = null;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(68, aspect, 0.15, 3500);
  }

  attach(physics: PhysicsWorld | null, track: Track | null): void {
    this.physics = physics;
    this.track = track;
    this.trackCameras = [];
    this.cinematicIndex = -1;
    this.initialized = false;
    if (!track) return;
    const spacing = 120;
    const count = Math.floor(track.length / spacing);
    for (let i = 0; i < count; i++) {
      const s = i * spacing + 30;
      const frame = track.sampleAt(s);
      const curvature = track.curvatureAt(s + 40);
      // Lado externo da curva seguinte (visão mais aberta).
      const side = curvature > 0 ? 1 : -1;
      const position = frame.position.clone().addScaledVector(frame.right, side * (track.barrierOffset + 4)).addScaledVector(UP, 4 + (i % 3));
      this.trackCameras.push({ s, position });
    }
  }

  setView(view: CameraView): void {
    this.view = view;
    this.cinematicIndex = -1;
  }

  cycleView(): CameraView {
    const index = CAMERA_VIEWS.indexOf(this.view);
    this.setView(CAMERA_VIEWS[(index + 1) % CAMERA_VIEWS.length]);
    return this.view;
  }

  /** Impulso de vibração (colisões). */
  kick(intensity: number): void {
    this.shakeEnergy = Math.min(1.5, this.shakeEnergy + intensity * 0.06);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  setFar(far: number): void {
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
  }

  startOrbit(angle = 0): void {
    this.mode = 'orbit';
    this.orbitAngle = angle;
  }

  stopOrbit(): void {
    this.mode = 'drive';
    this.initialized = false;
  }

  /** Câmera de cockpit esconde o piloto. */
  get hidesDriver(): boolean {
    return this.mode === 'drive' && this.view === 'cockpit';
  }

  update(dt: number, target: CameraTarget, trackS: number | null): void {
    this.time += dt;
    this.forward.set(0, 0, 1).applyQuaternion(target.quaternion);
    const speedFactor = smoothstep(0, target.topSpeed, Math.abs(target.forwardSpeed));
    let fov = this.settings.fov;

    if (this.mode === 'orbit') {
      this.orbitAngle += dt * 0.32;
      const radius = 7.2;
      const yaw = Math.atan2(this.forward.x, this.forward.z) + this.orbitAngle;
      this.camera.position.set(target.position.x + Math.sin(yaw) * radius, target.position.y + 1.6 + Math.sin(this.time * 0.4) * 0.3, target.position.z + Math.cos(yaw) * radius);
      this.keepAboveGround(this.camera.position, 0.8);
      this.camera.lookAt(this.tmpA.copy(target.position).addScaledVector(UP, 0.4));
      this.applyFov(52, dt);
      return;
    }

    switch (this.view) {
      case 'hood':
      case 'cockpit': {
        const local = this.view === 'hood' ? target.model.hoodCamera : target.model.cockpitCamera;
        this.camera.position.copy(local).applyQuaternion(target.quaternion).add(target.position);
        this.look.copy(this.forward).multiplyScalar(30).add(this.camera.position);
        const upLocal = this.tmpA.copy(UP).applyQuaternion(target.quaternion);
        this.look.addScaledVector(upLocal, this.view === 'cockpit' ? -1.6 : -0.6);
        this.camera.up.copy(upLocal).lerp(UP, 0.6).normalize();
        this.camera.lookAt(this.look);
        this.camera.up.copy(UP);
        fov = this.settings.fov + (this.view === 'cockpit' ? 4 : 0) + 8 * speedFactor;
        this.camera.near = this.view === 'cockpit' ? 0.05 : 0.1;
        break;
      }
      case 'cinematic': {
        this.camera.near = 0.3;
        if (!this.updateCinematic(target, trackS)) {
          this.updateChase(dt, target, speedFactor, 1.35, 1.25);
          fov = this.settings.fov + 10 * speedFactor;
        } else {
          const dist = this.camera.position.distanceTo(target.position);
          fov = clamp(THREE.MathUtils.radToDeg(2 * Math.atan(5.5 / Math.max(dist, 1))), 14, 62);
        }
        break;
      }
      default: {
        this.camera.near = 0.15;
        const far = this.view === 'chaseFar';
        this.updateChase(dt, target, speedFactor, far ? 1.55 : 1, far ? 1.45 : 1);
        fov = this.settings.fov + 12 * speedFactor;
      }
    }

    // Vibração: impactos + velocidade + superfície irregular.
    this.shakeEnergy = Math.max(0, this.shakeEnergy - dt * 1.8);
    const vibration = (this.shakeEnergy + speedFactor * 0.025 + target.roughness * speedFactor * 0.12) * this.settings.shake;
    if (vibration > 0.0005 && this.view !== 'cinematic') {
      const t = this.time;
      this.camera.position.x += (Math.sin(t * 37.1) + Math.sin(t * 61.7) * 0.5) * vibration * 0.06;
      this.camera.position.y += (Math.sin(t * 43.3) + Math.sin(t * 71.9) * 0.5) * vibration * 0.06;
      this.camera.rotation.z += Math.sin(t * 29.3) * vibration * 0.01;
    }
    this.applyFov(fov, dt);
  }

  private applyFov(fov: number, dt: number): void {
    const next = this.camera.fov + (fov - this.camera.fov) * dampFactor(6, dt);
    if (Math.abs(next - this.camera.fov) > 0.01 || this.camera.near !== this.camera.near) {
      this.camera.fov = next;
    }
    this.camera.updateProjectionMatrix();
  }

  private updateChase(dt: number, target: CameraTarget, speedFactor: number, distanceScale: number, heightScale: number): void {
    // Direção de referência: frente do carro, com leve influência da direção do movimento.
    const flatForward = this.tmpA.set(this.forward.x, 0, this.forward.z);
    if (flatForward.lengthSq() < 1e-4) flatForward.set(0, 0, 1);
    flatForward.normalize();
    const vel = this.tmpB.set(target.velocity.x, 0, target.velocity.z);
    const speed = vel.length();
    if (speed > 4 && target.forwardSpeed > 2) {
      vel.divideScalar(speed);
      flatForward.lerp(vel, 0.3 * smoothstep(4, 20, speed)).normalize();
    }
    if (!this.initialized) {
      this.yawDir.copy(flatForward);
    } else {
      this.yawDir.lerp(flatForward, dampFactor(5.5, dt)).normalize();
    }

    const distance = 6.1 * this.settings.distance * distanceScale * (1 + 0.1 * speedFactor);
    const height = 1.85 * this.settings.height * heightScale;
    const desired = this.tmpC.copy(this.yawDir).multiplyScalar(-distance).addScaledVector(UP, height);
    if (!this.initialized) {
      this.offset.copy(desired);
      this.initialized = true;
    } else {
      this.offset.lerp(desired, dampFactor(9, dt));
    }
    const camPos = this.camera.position.copy(target.position).add(this.offset);
    this.avoidObstacles(target.position, camPos);
    this.keepAboveGround(camPos, 0.6);
    this.look.copy(target.position).addScaledVector(this.yawDir, 2.2).addScaledVector(UP, 0.95);
    this.camera.lookAt(this.look);
  }

  private updateCinematic(target: CameraTarget, trackS: number | null): boolean {
    const track = this.track;
    if (!track || trackS === null || this.trackCameras.length === 0) return false;
    // Escolhe a câmera à frente do carro (o carro se aproxima dela).
    if (this.cinematicIndex >= 0) {
      const cam = this.trackCameras[this.cinematicIndex];
      const ds = track.closed ? wrappedDelta(trackS, cam.s, track.length) : cam.s - trackS;
      if (ds < -25 || ds > 220) this.cinematicIndex = -1;
    }
    if (this.cinematicIndex < 0) {
      let best = -1;
      let bestDs = Infinity;
      for (let i = 0; i < this.trackCameras.length; i++) {
        const cam = this.trackCameras[i];
        const ds = track.closed ? wrappedDelta(trackS, cam.s, track.length) : cam.s - trackS;
        if (ds > 15 && ds < bestDs) {
          bestDs = ds;
          best = i;
        }
      }
      if (best < 0 || bestDs > 200) return false;
      this.cinematicIndex = best;
    }
    const cam = this.trackCameras[this.cinematicIndex];
    this.camera.position.copy(cam.position);
    this.keepAboveGround(this.camera.position, 2.5);
    this.camera.lookAt(this.look.copy(target.position).addScaledVector(UP, 0.6));
    return true;
  }

  private avoidObstacles(from: THREE.Vector3, camPos: THREE.Vector3): void {
    if (!this.physics) return;
    const origin = this.tmpA.copy(from).addScaledVector(UP, 1.2);
    const dir = this.tmpB.subVectors(camPos, origin);
    const dist = dir.length();
    if (dist < 0.01) return;
    dir.divideScalar(dist);
    const hit = this.physics.castRay(origin, dir, dist, QueryGroups.camera);
    if (hit && hit.info?.kind !== 'ground') {
      camPos.copy(origin).addScaledVector(dir, Math.max(1.2, hit.distance - 0.35));
    }
  }

  private keepAboveGround(position: THREE.Vector3, minHeight: number): void {
    if (!this.physics) return;
    const origin = this.tmpA.copy(position).addScaledVector(UP, 6);
    const hit = this.physics.castRay(origin, { x: 0, y: -1, z: 0 }, 40, QueryGroups.ground);
    if (hit) {
      const groundY = hit.point.y;
      if (position.y < groundY + minHeight) position.y = groundY + minHeight;
    }
  }
}
