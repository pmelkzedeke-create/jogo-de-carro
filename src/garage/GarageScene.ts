/**
 * Garagem 3D: estúdio com piso reflexivo, iluminação de três pontos, mapa de ambiente
 * (RoomEnvironment → PMREM), plataforma giratória e câmera orbital (arrastar/zoom/pinça).
 * Também serve de fundo animado para os menus.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { clamp, damp } from '../utils/math';
import type { PaintOption, VehicleDefinition } from '../vehicles/VehicleConfig';
import { applyPaint, createVehicleModel, type VehicleMaterials, type VehicleModel } from '../rendering/VehicleModelFactory';
import type { LoadedVehicleAsset } from '../rendering/VehicleAssetLoader';

export type GarageMode = 'menu' | 'garage';

export class GarageScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  mode: GarageMode = 'menu';
  private model: VehicleModel | null = null;
  private vehicleId: string | null = null;
  private readonly turntable: THREE.Group;
  private readonly envTarget: THREE.WebGLRenderTarget;
  private yaw = 0.6;
  private pitch = 0.18;
  private distance = 7.2;
  private targetYaw = 0.6;
  private targetPitch = 0.18;
  private targetDistance = 7.2;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private idleTime = 0;
  private time = 0;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinchDistance = 0;
  private element: HTMLElement | null = null;
  private readonly right = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();

  constructor(
    renderer: THREE.WebGLRenderer,
    private readonly materials: VehicleMaterials,
  ) {
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envTarget = pmrem.fromScene(new RoomEnvironment(), 0.03);
    pmrem.dispose();
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = 0.9;
    this.scene.background = new THREE.Color(0x0a0b0d);
    this.scene.fog = new THREE.Fog(0x0a0b0d, 14, 40);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(30, 64),
      new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.32, metalness: 0.4 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.turntable = new THREE.Group();
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.5, 0.08, 64), new THREE.MeshStandardMaterial({ color: 0x1d2025, roughness: 0.25, metalness: 0.7 }));
    platform.position.y = 0.04;
    platform.receiveShadow = true;
    this.turntable.add(platform);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.45, 0.025, 8, 96), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff3b30, emissiveIntensity: 1.6 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.08;
    this.turntable.add(ring);
    this.scene.add(this.turntable);

    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(5, 8, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -6;
    key.shadow.camera.right = 6;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -6;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9db8ff, 1.4);
    rim.position.set(-6, 4, -6);
    this.scene.add(rim);
    const fill = new THREE.HemisphereLight(0xbfd2ff, 0x1a1a1a, 0.5);
    this.scene.add(fill);
    // Faixas de luz no "teto" (reflexos alongados na pintura).
    for (let i = -1; i <= 1; i++) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(10, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      strip.position.set(0, 7, i * 2.4);
      strip.rotation.x = Math.PI / 2;
      this.scene.add(strip);
    }
  }

  /** Conecta os controles de órbita a um elemento (área de arraste). */
  attachControls(element: HTMLElement): void {
    this.detachControls();
    this.element = element;
    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('pointermove', this.onPointerMove);
    element.addEventListener('pointerup', this.onPointerUp);
    element.addEventListener('pointercancel', this.onPointerUp);
    element.addEventListener('pointerleave', this.onPointerUp);
    element.addEventListener('wheel', this.onWheel, { passive: false });
  }

  detachControls(): void {
    const el = this.element;
    if (!el) return;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointercancel', this.onPointerUp);
    el.removeEventListener('pointerleave', this.onPointerUp);
    el.removeEventListener('wheel', this.onWheel);
    this.element = null;
    this.pointers.clear();
    this.dragging = false;
  }

  private onPointerDown = (e: PointerEvent) => {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.idleTime = 0;
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchDistance > 0) this.targetDistance = clamp(this.targetDistance * (this.pinchDistance / d), 4.2, 12);
      this.pinchDistance = d;
      return;
    }
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.targetYaw -= dx * 0.008;
    this.targetPitch = clamp(this.targetPitch + dy * 0.005, 0.02, 0.9);
    this.idleTime = 0;
  };

  private onPointerUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0) this.dragging = false;
    if (this.pointers.size < 2) this.pinchDistance = 0;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.targetDistance = clamp(this.targetDistance * (1 + Math.sign(e.deltaY) * 0.08), 4.2, 12);
    this.idleTime = 0;
  };

  private modelSource: 'gltf' | 'procedural' | null = null;

  setVehicle(definition: VehicleDefinition, paint: PaintOption, asset: LoadedVehicleAsset | null = null): void {
    const source = asset ? 'gltf' : 'procedural';
    if (this.vehicleId === definition.id && this.model && this.modelSource === source) {
      applyPaint(this.model.paintMaterial, paint);
      return;
    }
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
    this.modelSource = source;
    const model = createVehicleModel(definition, paint, this.materials, asset);
    // O modelo tem origem no centro da caixa de colisão; apoia as rodas no piso.
    const rideHeight = -model.wheels[0].root.position.y + definition.physics.wheels.radius;
    model.root.position.y = rideHeight + 0.08;
    model.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.turntable.add(model.root);
    this.model = model;
    this.vehicleId = definition.id;
  }

  get currentVehicleId(): string | null {
    return this.vehicleId;
  }

  setPaint(paint: PaintOption): void {
    if (this.model) applyPaint(this.model.paintMaterial, paint);
  }

  setMode(mode: GarageMode): void {
    this.mode = mode;
    this.targetDistance = mode === 'garage' ? 7.6 : 8.4;
    this.targetPitch = mode === 'garage' ? 0.16 : 0.12;
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    this.time += dt;
    this.idleTime += dt;
    if (!this.dragging && this.idleTime > 2.5) this.targetYaw += dt * (this.mode === 'menu' ? 0.12 : 0.18);
    this.yaw = damp(this.yaw, this.targetYaw, 6, dt);
    this.pitch = damp(this.pitch, this.targetPitch, 6, dt);
    this.distance = damp(this.distance, this.targetDistance, 6, dt);
    const targetY = 0.65;
    // No menu, o carro fica deslocado para a direita da tela (espaço para o menu à esquerda).
    const offset = this.mode === 'menu' && this.camera.aspect > 1.1 ? -1.6 : 0;
    const cx = Math.sin(this.yaw) * Math.cos(this.pitch) * this.distance;
    const cz = Math.cos(this.yaw) * Math.cos(this.pitch) * this.distance;
    const cy = targetY + Math.sin(this.pitch) * this.distance;
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.camera.position.set(cx, cy, cz).addScaledVector(this.right, offset);
    this.lookAt.copy(this.right).multiplyScalar(offset).setY(targetY);
    this.camera.lookAt(this.lookAt);
    if (this.model) {
      for (const w of this.model.wheels) w.root.rotation.y = 0;
    }
  }

  dispose(): void {
    this.detachControls();
    this.model?.dispose();
    this.envTarget.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}
