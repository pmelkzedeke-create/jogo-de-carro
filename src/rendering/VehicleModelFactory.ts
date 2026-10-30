/**
 * Gerador de modelos PROCEDURAIS e PROVISÓRIOS de carros (originais, sem marcas reais).
 * A carroceria é construída por seções transversais (loft) com arcos de roda, cabine envidraçada,
 * teto pintado, colunas, faróis/lanternas emissivos funcionais, spoiler, interior e piloto.
 * Quando um modelo GLB estiver disponível (VehicleLoader), ele substitui este modelo sem mudar a física.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { smoothstep } from '../utils/math';
import type { PaintOption, ProceduralBodySpec, VehicleDefinition } from '../vehicles/VehicleConfig';
import { resolvePhysics } from '../vehicles/VehicleConfig';

export interface WheelVisual {
  /** Posicionado no centro da roda; rotação Y = esterço. */
  root: THREE.Group;
  /** Rotação X = giro da roda. */
  spin: THREE.Group;
  isLeft: boolean;
  isFront: boolean;
}

export interface VehicleModel {
  root: THREE.Group;
  /** Carroceria (recebe inclinação visual). */
  body: THREE.Group;
  wheels: WheelVisual[];
  paintMaterial: THREE.MeshPhysicalMaterial;
  brakeLightMaterial: THREE.MeshStandardMaterial;
  reverseLightMaterial: THREE.MeshStandardMaterial;
  headlightMaterial: THREE.MeshStandardMaterial;
  /** Posições locais dos faróis (para luzes reais do jogador). */
  headlightPositions: THREE.Vector3[];
  /** Ponto da câmera de capô e de cockpit (local). */
  hoodCamera: THREE.Vector3;
  cockpitCamera: THREE.Vector3;
  /** Malha do piloto (oculta na câmera de cockpit). */
  driver: THREE.Object3D;
  provisional: boolean;
  dispose(): void;
}

/** Materiais compartilhados entre todos os carros. */
export class VehicleMaterials {
  readonly glass = new THREE.MeshPhysicalMaterial({
    color: 0x0c1116,
    metalness: 0.05,
    roughness: 0.04,
    transparent: true,
    opacity: 0.8,
    envMapIntensity: 1.6,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
  });
  readonly trim = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.55, metalness: 0.1 });
  readonly liner = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.9, metalness: 0, side: THREE.BackSide });
  readonly grille = new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 0.4, metalness: 0.3 });
  readonly chrome = new THREE.MeshStandardMaterial({ color: 0xe0e3e6, roughness: 0.12, metalness: 1 });
  readonly tire = new THREE.MeshStandardMaterial({ color: 0x17171a, roughness: 0.9, metalness: 0 });
  readonly interior = new THREE.MeshStandardMaterial({ color: 0x1d1f23, roughness: 0.85, metalness: 0 });
  readonly brakeParts = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.6 });
  readonly headlight = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4dc, emissiveIntensity: 1.4, roughness: 0.1, metalness: 0.2 });
  readonly suit = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.8 });
  readonly helmet = new THREE.MeshPhysicalMaterial({ color: 0xf2f2f2, roughness: 0.3, clearcoat: 1 });
  readonly visor = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.1, metalness: 0.6 });
  private readonly rims = new Map<string, THREE.MeshStandardMaterial>();

  rim(color: string): THREE.MeshStandardMaterial {
    let m = this.rims.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, metalness: 0.9, roughness: 0.28 });
      this.rims.set(color, m);
    }
    return m;
  }

  setNight(night: boolean): void {
    this.headlight.emissiveIntensity = night ? 4 : 1.4;
  }

  dispose(): void {
    for (const m of [this.glass, this.trim, this.liner, this.grille, this.chrome, this.tire, this.interior, this.brakeParts, this.headlight, this.suit, this.helmet, this.visor]) m.dispose();
    for (const m of this.rims.values()) m.dispose();
  }
}

const geometryCache = new Map<string, THREE.BufferGeometry>();

function cachedGeometry(key: string, factory: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geometryCache.get(key);
  if (!g) {
    g = factory();
    geometryCache.set(key, g);
  }
  return g;
}

export function createPaintMaterial(paint: PaintOption): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: paint.color,
    metalness: paint.metalness,
    roughness: paint.roughness,
    clearcoat: paint.clearcoat,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.25,
  });
}

export function applyPaint(material: THREE.MeshPhysicalMaterial, paint: PaintOption): void {
  material.color.set(paint.color);
  material.metalness = paint.metalness;
  material.roughness = paint.roughness;
  material.clearcoat = paint.clearcoat;
}

interface BodyProfile {
  spec: ProceduralBodySpec;
  rideHeight: number;
  wheelRadius: number;
  frontAxle: number;
  rearAxle: number;
  /** Altura do centro da roda acima do solo. */
  wheelCenterY: number;
}

/** Meia largura da carroceria em planta. */
function halfWidthAt(p: BodyProfile, z: number): number {
  const L = p.spec.length / 2;
  const zn = Math.min(0.995, Math.abs(z) / L);
  const front = z > 0;
  const exponent = front ? 2.6 : 4.2;
  const minFrac = front ? 0.5 : 0.62;
  const shape = Math.pow(1 - Math.pow(zn, exponent), 1 / exponent);
  return (p.spec.width / 2) * (minFrac + (1 - minFrac) * shape);
}

/** Altura (acima do solo) da base da carroceria, com arcos das rodas. */
function bottomAt(p: BodyProfile, z: number): number {
  const L = p.spec.length / 2;
  const zn = Math.abs(z) / L;
  let y = p.spec.groundClearance + 0.12 * smoothstep(0.8, 1, zn);
  const archR = p.wheelRadius + 0.05;
  for (const axle of [p.frontAxle, p.rearAxle]) {
    const dz = z - axle;
    if (Math.abs(dz) < archR) y = Math.max(y, p.wheelCenterY + Math.sqrt(archR * archR - dz * dz) * 0.98);
  }
  return y;
}

/** Altura do topo da carroceria (capô, linha de cintura, tampa traseira). */
function topAt(p: BodyProfile, z: number): number {
  const s = p.spec;
  const L = s.length / 2;
  const belt = s.beltHeight;
  const noseDrop = s.style === 'super' ? 0.24 : s.style === 'muscle' ? 0.14 : s.style === 'hatch' ? 0.2 : 0.18;
  const nose = belt - noseDrop;
  if (z > s.windshieldBase) {
    const t = (z - s.windshieldBase) / Math.max(0.01, L - s.windshieldBase);
    return belt + (nose - belt) * Math.pow(t, 1.7) - 0.04 * smoothstep(0.92, 1, t);
  }
  if (z < s.rearGlassBase) {
    const t = (s.rearGlassBase - z) / Math.max(0.01, s.rearGlassBase + L);
    const deck = s.style === 'hatch' ? belt + 0.06 : belt + 0.03;
    const tail = s.style === 'hatch' ? belt - 0.02 : s.style === 'super' ? belt - 0.04 : belt - 0.07;
    return deck + (tail - deck) * Math.pow(t, 1.5) - 0.05 * smoothstep(0.9, 1, t);
  }
  return belt + 0.015;
}

/** Altura do teto (acima do solo) ao longo da cabine. */
function roofAt(p: BodyProfile, z: number): number {
  const s = p.spec;
  const belt = s.beltHeight;
  if (z >= s.windshieldTop) {
    const t = (z - s.windshieldTop) / Math.max(0.01, s.windshieldBase - s.windshieldTop);
    return s.roofHeight + (belt - s.roofHeight) * Math.pow(t, 1.15);
  }
  if (z >= s.roofEnd) {
    const t = (z - s.roofEnd) / Math.max(0.01, s.windshieldTop - s.roofEnd);
    return s.roofHeight - 0.03 * Math.pow(2 * t - 1, 2);
  }
  const t = (s.roofEnd - z) / Math.max(0.01, s.roofEnd - s.rearGlassBase);
  const end = topAt(p, s.rearGlassBase);
  return s.roofHeight - 0.03 + (end - (s.roofHeight - 0.03)) * Math.pow(t, s.style === 'hatch' ? 1.4 : 1.1);
}

/** Loft genérico: cria uma malha a partir de anéis de seções transversais. */
function loft(rings: THREE.Vector3[][], capStart: boolean, capEnd: boolean): THREE.BufferGeometry {
  const ringSize = rings[0].length;
  const positions: number[] = [];
  const indices: number[] = [];
  for (const ring of rings) for (const p of ring) positions.push(p.x, p.y, p.z);
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < ringSize; j++) {
      const a = i * ringSize + j;
      const b = i * ringSize + ((j + 1) % ringSize);
      const c = a + ringSize;
      const d = b + ringSize;
      indices.push(a, c, b, b, c, d);
    }
  }
  const addCap = (ringIndex: number, reverse: boolean) => {
    const ring = rings[ringIndex];
    const center = new THREE.Vector3();
    for (const p of ring) center.add(p);
    center.divideScalar(ring.length);
    const ci = positions.length / 3;
    positions.push(center.x, center.y, center.z);
    for (let j = 0; j < ringSize; j++) {
      const a = ringIndex * ringSize + j;
      const b = ringIndex * ringSize + ((j + 1) % ringSize);
      if (reverse) indices.push(ci, b, a);
      else indices.push(ci, a, b);
    }
  };
  if (capStart) addCap(0, false);
  if (capEnd) addCap(rings.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Anel da carroceria: superelipse com laterais quase verticais e ombro arredondado. */
function bodyRing(halfWidth: number, bottom: number, top: number, z: number, offsetY: number, segments = 28): THREE.Vector3[] {
  const ring: THREE.Vector3[] = [];
  const c = (bottom + top) / 2;
  const hh = Math.max(0.02, (top - bottom) / 2);
  for (let i = 0; i < segments; i++) {
    // Começa no centro inferior e gira no sentido que mantém as normais para fora.
    const theta = -Math.PI / 2 - (i / segments) * Math.PI * 2;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const n = st < 0 ? 5 : 2.6;
    let x = halfWidth * Math.sign(ct) * Math.pow(Math.abs(ct), 2 / n);
    const y = c + hh * Math.sign(st) * Math.pow(Math.abs(st), 2 / n);
    x *= 1 - 0.06 * Math.pow(Math.max(0, st), 2);
    ring.push(new THREE.Vector3(x, y + offsetY, z));
  }
  return ring;
}

/** Anel da cabine (estufa). */
function cabinRing(halfBottom: number, halfTop: number, bottom: number, top: number, z: number, offsetY: number, segments = 20): THREE.Vector3[] {
  const ring: THREE.Vector3[] = [];
  const h = Math.max(0.01, top - bottom);
  for (let i = 0; i < segments; i++) {
    const theta = -Math.PI / 2 - (i / segments) * Math.PI * 2;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    let x: number;
    let y: number;
    if (st >= 0) {
      const n = 3;
      const wx = halfBottom + (halfTop - halfBottom) * st;
      x = wx * Math.sign(ct) * Math.pow(Math.abs(ct), 2 / n);
      y = bottom + h * Math.pow(st, 2 / n);
    } else {
      x = halfBottom * Math.sign(ct) * Math.pow(Math.abs(ct), 0.5);
      y = bottom - 0.04 * Math.pow(-st, 0.5);
    }
    ring.push(new THREE.Vector3(x, y + offsetY, z));
  }
  return ring;
}

function tireGeometry(radius: number, width: number, rimRadius: number): THREE.BufferGeometry {
  return cachedGeometry(`tire-${radius}-${width}-${rimRadius}`, () => {
    const hw = width / 2;
    const r = 0.035;
    const pts = [
      new THREE.Vector2(rimRadius, -hw * 0.92),
      new THREE.Vector2(radius - r, -hw),
      new THREE.Vector2(radius - r * 0.3, -hw + r * 0.3),
      new THREE.Vector2(radius, -hw + r),
      new THREE.Vector2(radius, hw - r),
      new THREE.Vector2(radius - r * 0.3, hw - r * 0.3),
      new THREE.Vector2(radius - r, hw),
      new THREE.Vector2(rimRadius, hw * 0.92),
    ];
    const g = new THREE.LatheGeometry(pts, 36);
    // Eixo do torno (Y) → eixo da roda (X).
    g.rotateZ(-Math.PI / 2);
    return g;
  });
}

function rimGeometry(rimRadius: number, width: number, style: ProceduralBodySpec['rimStyle']): THREE.BufferGeometry {
  return cachedGeometry(`rim-${rimRadius}-${width}-${style}`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const face = width / 2 - 0.03;
    const barrel = new THREE.CylinderGeometry(rimRadius, rimRadius, width * 0.86, 28, 1, true);
    barrel.rotateZ(Math.PI / 2);
    parts.push(barrel.toNonIndexed());
    const lip = new THREE.TorusGeometry(rimRadius - 0.012, 0.016, 6, 32);
    lip.rotateY(Math.PI / 2);
    lip.translate(face, 0, 0);
    parts.push(lip.toNonIndexed());
    const hub = new THREE.CylinderGeometry(rimRadius * 0.22, rimRadius * 0.26, 0.06, 16);
    hub.rotateZ(Math.PI / 2);
    hub.translate(face - 0.02, 0, 0);
    parts.push(hub.toNonIndexed());
    const count = style === 'spoke5' ? 5 : style === 'mesh' ? 10 : 12;
    for (let k = 0; k < count; k++) {
      const angle = (k / count) * Math.PI * 2;
      const thickness = style === 'spoke5' ? 0.075 : style === 'mesh' ? 0.032 : 0.05;
      const spoke = new THREE.BoxGeometry(0.035, rimRadius * 0.82, thickness);
      spoke.translate(0, rimRadius * 0.5, 0);
      if (style === 'turbine') spoke.rotateY(0.5);
      if (style === 'mesh') spoke.rotateX((k % 2 === 0 ? 1 : -1) * 0.18);
      spoke.rotateX(angle);
      spoke.translate(face - 0.025, 0, 0);
      parts.push(spoke.toNonIndexed());
    }
    return mergeGeometries(parts);
  });
}

function brakeGeometry(rimRadius: number, caliperColor: THREE.Color): THREE.BufferGeometry {
  const key = `brake-${rimRadius}-${caliperColor.getHexString()}`;
  return cachedGeometry(key, () => {
    const disc = new THREE.CylinderGeometry(rimRadius * 0.8, rimRadius * 0.8, 0.028, 28).toNonIndexed();
    disc.rotateZ(Math.PI / 2);
    const caliper = new THREE.BoxGeometry(0.07, rimRadius * 0.5, rimRadius * 0.34).toNonIndexed();
    caliper.translate(0.035, rimRadius * 0.55, -rimRadius * 0.15);
    const color = (g: THREE.BufferGeometry, c: THREE.Color) => {
      const n = g.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        arr[i * 3] = c.r;
        arr[i * 3 + 1] = c.g;
        arr[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    };
    color(disc, new THREE.Color(0x6b6e73));
    color(caliper, caliperColor);
    return mergeGeometries([disc, caliper]);
  });
}

export function createProceduralVehicle(definition: VehicleDefinition, paint: PaintOption, materials: VehicleMaterials): VehicleModel {
  const spec = definition.visual.procedural;
  const phys = resolvePhysics(definition.physics);
  const w = definition.physics.wheels;
  const rideHeight = phys.rideHeight;
  const offsetY = -rideHeight; // converte altura sobre o solo → espaço do modelo
  const profile: BodyProfile = {
    spec,
    rideHeight,
    wheelRadius: w.radius,
    frontAxle: w.frontAxle,
    rearAxle: w.rearAxle,
    wheelCenterY: w.radius,
  };

  const root = new THREE.Group();
  root.name = `vehicle-${definition.id}`;
  const body = new THREE.Group();
  root.add(body);
  const paintMaterial = createPaintMaterial(paint);
  const brakeLightMaterial = new THREE.MeshStandardMaterial({ color: 0x3a0000, emissive: 0xff1208, emissiveIntensity: 0.7, roughness: 0.2 });
  const reverseLightMaterial = new THREE.MeshStandardMaterial({ color: 0x777777, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.2 });
  const ownGeometries: THREE.BufferGeometry[] = [];
  const addMesh = (geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = body, cast = true) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    parent.add(mesh);
    ownGeometries.push(geometry);
    return mesh;
  };

  // --- Carroceria ---
  const L = spec.length / 2;
  const sections = 44;
  const bodyRings: THREE.Vector3[][] = [];
  for (let i = 0; i <= sections; i++) {
    const t = i / sections;
    // Mais seções perto das extremidades e dos arcos.
    const z = -L + (L * 2) * (0.5 - 0.5 * Math.cos(t * Math.PI));
    bodyRings.push(bodyRing(halfWidthAt(profile, z), bottomAt(profile, z), topAt(profile, z), z, offsetY));
  }
  addMesh(loft(bodyRings, true, true), paintMaterial);

  // Fundo escuro e caixa interna (bloqueiam a visão através dos arcos).
  const tub = new THREE.BoxGeometry(spec.width * 0.82, 0.3, (w.frontAxle - w.rearAxle) * 0.7);
  tub.translate(0, spec.groundClearance + 0.2 + offsetY, (w.frontAxle + w.rearAxle) / 2);
  addMesh(tub, materials.trim, body, false);

  // Caixas de roda internas (escuras).
  for (const axle of [w.frontAxle, w.rearAxle]) {
    for (const side of [1, -1]) {
      const track = axle === w.frontAxle ? w.frontTrack : w.rearTrack;
      // Meio cilindro ao redor do eixo X cobrindo a parte superior da roda (visto por dentro).
      const liner = new THREE.CylinderGeometry(w.radius + 0.06, w.radius + 0.06, w.width + 0.12, 16, 1, true, 0, Math.PI);
      liner.rotateZ(Math.PI / 2);
      liner.translate((side * track) / 2, w.radius + offsetY, axle);
      addMesh(liner, materials.liner, body, false);
    }
  }

  // --- Cabine: casca pintada (teto e colunas) + vidros recortados da mesma superfície ---
  const CABIN_SEGMENTS = 40;
  const cabinSections = 26;
  const cabinZ: number[] = [];
  const cabinRings: THREE.Vector3[][] = [];
  for (let i = 0; i <= cabinSections; i++) {
    const z = spec.rearGlassBase + ((spec.windshieldBase - spec.rearGlassBase) * i) / cabinSections;
    const hwBody = halfWidthAt(profile, z) * spec.cabinWidthRatio;
    const bottom = Math.min(topAt(profile, z), spec.beltHeight + 0.01) - 0.02;
    const top = Math.max(bottom + 0.02, roofAt(profile, z));
    cabinZ.push(z);
    cabinRings.push(cabinRing(hwBody, hwBody * 0.8, bottom, top, z, offsetY, CABIN_SEGMENTS));
  }
  addMesh(loft(cabinRings, true, true), paintMaterial);

  // Índices do anel: 0 = centro inferior; 1/4 = lateral direita (−X); 1/2 = topo; 3/4 = lateral esquerda (+X).
  const q = CABIN_SEGMENTS / 4;
  const glassStrip = (fromIndex: number, toIndex: number, zMin: number, zMax: number): THREE.BufferGeometry | null => {
    const rows: THREE.Vector3[][] = [];
    for (let r = 0; r < cabinRings.length; r++) {
      const z = cabinZ[r];
      if (z < zMin - 1e-4 || z > zMax + 1e-4) continue;
      const ring = cabinRings[r];
      // Centro aproximado do anel para empurrar o vidro alguns milímetros para fora.
      let cx = 0;
      let cy = 0;
      for (const p of ring) {
        cx += p.x;
        cy += p.y;
      }
      cx /= ring.length;
      cy /= ring.length;
      const row: THREE.Vector3[] = [];
      for (let k = fromIndex; k <= toIndex; k++) {
        const p = ring[((k % CABIN_SEGMENTS) + CABIN_SEGMENTS) % CABIN_SEGMENTS];
        const dx = p.x - cx;
        const dy = p.y - cy;
        const len = Math.hypot(dx, dy) || 1;
        row.push(new THREE.Vector3(p.x + (dx / len) * 0.008, p.y + (dy / len) * 0.008, p.z));
      }
      rows.push(row);
    }
    if (rows.length < 2) return null;
    const positions: number[] = [];
    const indices: number[] = [];
    const w = rows[0].length;
    for (const row of rows) for (const p of row) positions.push(p.x, p.y, p.z);
    for (let r = 0; r < rows.length - 1; r++) {
      for (let k = 0; k < w - 1; k++) {
        const a = r * w + k;
        const b = a + 1;
        const c = a + w;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  };
  const cabinLength = spec.windshieldBase - spec.rearGlassBase;
  const pillar = cabinLength * 0.035;
  const glassParts: Array<THREE.BufferGeometry | null> = [
    // Para-brisa e vidro traseiro (setor superior).
    glassStrip(Math.round(q * 1.55), Math.round(q * 2.45), spec.windshieldTop + pillar * 0.3, spec.windshieldBase - pillar * 0.6),
    glassStrip(Math.round(q * 1.55), Math.round(q * 2.45), spec.rearGlassBase + pillar * 0.6, spec.roofEnd - pillar * 0.3),
    // Janelas laterais (setores laterais), com coluna B no meio.
    glassStrip(Math.round(q * 1.08), Math.round(q * 1.42), spec.rearGlassBase + pillar * 2.2, (spec.windshieldTop + spec.roofEnd) / 2 - pillar),
    glassStrip(Math.round(q * 1.08), Math.round(q * 1.42), (spec.windshieldTop + spec.roofEnd) / 2 + pillar, spec.windshieldBase - pillar * 2.2),
    glassStrip(Math.round(q * 2.58), Math.round(q * 2.92), spec.rearGlassBase + pillar * 2.2, (spec.windshieldTop + spec.roofEnd) / 2 - pillar),
    glassStrip(Math.round(q * 2.58), Math.round(q * 2.92), (spec.windshieldTop + spec.roofEnd) / 2 + pillar, spec.windshieldBase - pillar * 2.2),
  ];
  const glassGeos = glassParts.filter((g): g is THREE.BufferGeometry => g !== null).map((g) => (g.index ? g.toNonIndexed() : g));
  if (glassGeos.length) addMesh(mergeGeometries(glassGeos), materials.glass, body, false);

  // --- Detalhes ---
  const trimGeos: THREE.BufferGeometry[] = [];
  const front = L - 0.02;
  const noseY = topAt(profile, front - 0.05);
  // Grade e entrada inferior.
  const grilleW = spec.width * (spec.style === 'super' ? 0.36 : 0.42);
  // Placas finas logo à frente da tampa frontal (sem cruzar a superfície da carroceria).
  const noseBottom = bottomAt(profile, L - 0.01);
  const grille = new THREE.BoxGeometry(grilleW, Math.max(0.06, (noseY - noseBottom) * 0.32), 0.02);
  grille.translate(0, noseBottom + (noseY - noseBottom) * 0.62 + offsetY, L + 0.012);
  trimGeos.push(grille);
  const intake = new THREE.BoxGeometry(spec.width * 0.42, Math.max(0.05, (noseY - noseBottom) * 0.22), 0.02);
  intake.translate(0, noseBottom + (noseY - noseBottom) * 0.2 + offsetY, L + 0.012);
  trimGeos.push(intake);
  // Saias laterais.
  for (const side of [1, -1]) {
    const len = (w.frontAxle - w.rearAxle) - (w.radius + 0.06) * 2;
    const skirt = new THREE.BoxGeometry(0.05, 0.1, len);
    skirt.translate(side * (halfWidthAt(profile, 0) - 0.01), spec.groundClearance + 0.05 + offsetY, (w.frontAxle + w.rearAxle) / 2);
    trimGeos.push(skirt);
    // Retrovisores.
    const mz = spec.windshieldBase - 0.12;
    const mx = side * (halfWidthAt(profile, mz) * spec.cabinWidthRatio + 0.1);
    const mirror = new THREE.BoxGeometry(0.16, 0.1, 0.12);
    mirror.translate(mx, spec.beltHeight + 0.08 + offsetY, mz);
    trimGeos.push(mirror);
  }
  // Difusor traseiro.
  const diffuser = new THREE.BoxGeometry(spec.width * 0.7, 0.12, 0.25);
  diffuser.translate(0, spec.groundClearance + 0.06 + offsetY, -L + 0.12);
  trimGeos.push(diffuser);
  // Spoiler.
  const deckY = topAt(profile, -L + 0.3);
  if (spec.spoiler === 'lip') {
    const lip = new THREE.BoxGeometry(spec.width * 0.82, 0.03, 0.12);
    lip.translate(0, deckY + 0.02 + offsetY, -L + 0.14);
    trimGeos.push(lip);
  } else if (spec.spoiler === 'wing') {
    const wing = new THREE.BoxGeometry(spec.width * 0.94, 0.045, 0.32);
    wing.rotateX(-0.12);
    wing.translate(0, deckY + 0.32 + offsetY, -L + 0.28);
    trimGeos.push(wing);
    for (const side of [1, -1]) {
      const post = new THREE.BoxGeometry(0.04, 0.3, 0.12);
      post.translate(side * spec.width * 0.28, deckY + 0.16 + offsetY, -L + 0.3);
      trimGeos.push(post);
      const plate = new THREE.BoxGeometry(0.02, 0.18, 0.36);
      plate.translate(side * spec.width * 0.47, deckY + 0.3 + offsetY, -L + 0.28);
      trimGeos.push(plate);
    }
  }
  addMesh(mergeGeometries(trimGeos.map((g) => (g.index ? g.toNonIndexed() : g))), materials.trim);
  trimGeos.forEach((g) => g.dispose());
  if (spec.spoiler === 'ducktail') {
    const tail = new THREE.BoxGeometry(spec.width * 0.8, 0.045, 0.16);
    tail.rotateX(-0.22);
    tail.translate(0, deckY + 0.02 + offsetY, -L + 0.1);
    addMesh(tail, paintMaterial);
  }

  // Escapamentos (exceto elétricos).
  if (definition.audio.profile !== 'electric') {
    const pipes: THREE.BufferGeometry[] = [];
    for (const side of [1, -1]) {
      const pipe = new THREE.CylinderGeometry(0.042, 0.046, 0.1, 12);
      pipe.rotateX(Math.PI / 2);
      pipe.translate(side * spec.width * 0.28, spec.groundClearance + 0.09 + offsetY, -L + 0.02);
      pipes.push(pipe.toNonIndexed());
    }
    addMesh(mergeGeometries(pipes), materials.chrome);
  }

  // Faróis.
  const headlightPositions: THREE.Vector3[] = [];
  const headGeos: THREE.BufferGeometry[] = [];
  for (const [x, y, z] of definition.visual.headlights) {
    const g = new THREE.BoxGeometry(0.34, 0.08, 0.1);
    g.rotateY(Math.sign(x) * 0.18);
    g.translate(x, y, z);
    headGeos.push(g.toNonIndexed());
    headlightPositions.push(new THREE.Vector3(x, y, z + 0.05));
  }
  addMesh(mergeGeometries(headGeos), materials.headlight, body, false);
  // Lanternas (luz de freio) + barra contínua em alguns estilos.
  const tailGeos: THREE.BufferGeometry[] = [];
  for (const [x, y, z] of definition.visual.taillights) {
    const g = new THREE.BoxGeometry(0.36, 0.07, 0.06);
    g.translate(x, y, z);
    tailGeos.push(g.toNonIndexed());
  }
  if (spec.style === 'super' || definition.category === 'electric') {
    const [x, y, z] = definition.visual.taillights[0];
    const bar = new THREE.BoxGeometry(Math.abs(x) * 2, 0.03, 0.05);
    bar.translate(0, y + 0.02, z);
    tailGeos.push(bar.toNonIndexed());
  }
  addMesh(mergeGeometries(tailGeos), brakeLightMaterial, body, false);
  const reverseGeos: THREE.BufferGeometry[] = [];
  for (const [x, y, z] of definition.visual.taillights) {
    const g = new THREE.BoxGeometry(0.1, 0.05, 0.05);
    g.translate(x * 0.6, y - 0.08, z + 0.005);
    reverseGeos.push(g.toNonIndexed());
  }
  addMesh(mergeGeometries(reverseGeos), reverseLightMaterial, body, false);

  // --- Interior e piloto ---
  const interiorGeos: THREE.BufferGeometry[] = [];
  const cabinMid = (spec.windshieldBase + spec.roofEnd) / 2;
  const dash = new THREE.BoxGeometry(spec.width * 0.74, 0.16, 0.32);
  dash.translate(0, spec.beltHeight - 0.06 + offsetY, spec.windshieldBase - 0.22);
  interiorGeos.push(dash);
  const driverX = spec.width * 0.2;
  const seatZ = cabinMid - 0.35;
  // Altura do capacete limitada pelo teto (carros baixos sentam o piloto mais reclinado).
  const roofAtSeat = roofAt(profile, seatZ - 0.08);
  const helmetY = Math.min(spec.groundClearance + 1.06, roofAtSeat - 0.2);
  const seatDrop = spec.groundClearance + 1.06 - helmetY;
  for (const side of [1, -1]) {
    const seat = new THREE.BoxGeometry(0.46, 0.14, 0.5);
    seat.translate(side * driverX, spec.groundClearance + 0.32 + offsetY, seatZ);
    interiorGeos.push(seat);
    const back = new THREE.BoxGeometry(0.46, 0.6, 0.12);
    back.rotateX(-0.2);
    back.translate(side * driverX, spec.groundClearance + 0.66 + offsetY, seatZ - 0.28);
    interiorGeos.push(back);
  }
  addMesh(mergeGeometries(interiorGeos.map((g) => (g.index ? g.toNonIndexed() : g))), materials.interior, body, false);
  interiorGeos.forEach((g) => g.dispose());
  const wheel = new THREE.TorusGeometry(0.17, 0.025, 8, 24);
  wheel.rotateX(-0.35);
  wheel.translate(driverX, spec.beltHeight - 0.02 + offsetY, spec.windshieldBase - 0.48);
  addMesh(wheel, materials.trim, body, false);

  const driver = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.5, 0.26), materials.suit);
  torso.position.set(driverX, spec.groundClearance + 0.7 - seatDrop + offsetY, seatZ - 0.12 - seatDrop * 0.5);
  torso.rotation.x = -0.2 - seatDrop * 0.8;
  ownGeometries.push(torso.geometry);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), materials.helmet);
  helmet.position.set(driverX, helmetY + offsetY, seatZ - 0.08 - seatDrop * 0.6);
  ownGeometries.push(helmet.geometry);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.132, 16, 8, -0.9, 1.8, 1.1, 0.7), materials.visor);
  visor.position.copy(helmet.position);
  ownGeometries.push(visor.geometry);
  driver.add(torso, helmet, visor);
  body.add(driver);

  // --- Rodas ---
  const rimRadius = w.radius * (spec.style === 'super' ? 0.68 : spec.style === 'hatch' ? 0.6 : 0.64);
  const tire = tireGeometry(w.radius, w.width, rimRadius);
  const rim = rimGeometry(rimRadius, w.width, spec.rimStyle);
  const caliperColor = new THREE.Color(spec.style === 'super' ? 0xffc400 : definition.category === 'sport' ? 0xc4161c : 0x2b2d31);
  const brake = brakeGeometry(rimRadius, caliperColor);
  const wheels: WheelVisual[] = [];
  const layout = [
    { x: w.frontTrack / 2, z: w.frontAxle, left: true, front: true },
    { x: -w.frontTrack / 2, z: w.frontAxle, left: false, front: true },
    { x: w.rearTrack / 2, z: w.rearAxle, left: true, front: false },
    { x: -w.rearTrack / 2, z: w.rearAxle, left: false, front: false },
  ];
  for (const entry of layout) {
    const wheelRoot = new THREE.Group();
    wheelRoot.position.set(entry.x, w.radius + offsetY, entry.z);
    const spin = new THREE.Group();
    const mirror = new THREE.Group();
    if (!entry.left) mirror.rotation.y = Math.PI;
    const tireMesh = new THREE.Mesh(tire, materials.tire);
    const rimMesh = new THREE.Mesh(rim, materials.rim(spec.rimColor));
    tireMesh.castShadow = true;
    rimMesh.castShadow = true;
    mirror.add(tireMesh, rimMesh);
    spin.add(mirror);
    const brakeMesh = new THREE.Mesh(brake, materials.brakeParts);
    const brakeMirror = new THREE.Group();
    if (!entry.left) brakeMirror.rotation.y = Math.PI;
    brakeMesh.position.x = -0.02;
    brakeMirror.add(brakeMesh);
    wheelRoot.add(spin, brakeMirror);
    root.add(wheelRoot);
    wheels.push({ root: wheelRoot, spin, isLeft: entry.left, isFront: entry.front });
  }

  const hoodCamera = new THREE.Vector3(0, spec.beltHeight + 0.2 + offsetY, spec.windshieldBase - 0.05);
  const cockpitCamera = new THREE.Vector3(driverX, helmetY + 0.02 + offsetY, seatZ - 0.02 - seatDrop * 0.6);

  return {
    root,
    body,
    wheels,
    paintMaterial,
    brakeLightMaterial,
    reverseLightMaterial,
    headlightMaterial: materials.headlight,
    headlightPositions,
    hoodCamera,
    cockpitCamera,
    driver,
    provisional: true,
    dispose() {
      for (const g of ownGeometries) g.dispose();
      paintMaterial.dispose();
      brakeLightMaterial.dispose();
      reverseLightMaterial.dispose();
      root.removeFromParent();
    },
  };
}
