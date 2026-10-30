/**
 * Representação visual de uma pista, gerada a partir dos mesmos dados usados pela física.
 * Inclui: asfalto, zebras, acostamentos, áreas de escape, terreno, barreiras, linha de largada,
 * marcações do grid, pórtico com luzes de largada, arquibancadas, árvores (instanciadas por célula,
 * permitindo descarte por frustum) e cenário de acordo com o tema da pista.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Track } from '../tracks/Track';
import type { TrackRibbons } from '../tracks/TrackColliders';
import { BARRIER_HEIGHT } from '../tracks/TrackColliders';
import type { RibbonGeometry } from '../tracks/TrackGeometry';
import { terrainHeightAt, terrainIndices, terrainPositions, terrainTrackDistanceAt, type TerrainData } from '../tracks/Terrain';
import { SeededRandom, ValueNoise2D, hashString } from '../utils/rng';
import { clamp, smoothstep } from '../utils/math';
import type { MaterialLibrary } from './Materials';
import type { TextureLibrary } from './ProceduralTextures';

export interface TrackViewOptions {
  /** Fração da densidade de vegetação (0..1), conforme a qualidade gráfica. */
  sceneryDensity: number;
  shadows: boolean;
}

function ribbonGeometry(r: RibbonGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(r.positions, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(r.uvs, 2));
  g.setIndex(new THREE.BufferAttribute(r.indices, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Extruda um perfil 2D (lateral, altura) ao longo de uma polilinha. */
function extrudeAlong(points: THREE.Vector3[], profile: Array<[number, number]>, side: number, closed: boolean, uvScale: number): THREE.BufferGeometry {
  const n = points.length;
  const segments = closed ? n : n - 1;
  const rows = profile.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const dir = new THREE.Vector3();
  const out = new THREE.Vector3();
  let along = 0;
  const count = closed ? n + 1 : n;
  for (let k = 0; k < count; k++) {
    const i = k % n;
    const prev = points[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const next = points[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    dir.subVectors(next, prev).setY(0).normalize();
    out.set(-dir.z, 0, dir.x).multiplyScalar(side === 0 ? 1 : side);
    if (k > 0) along += points[i].distanceTo(points[(k - 1) % n]);
    for (let r = 0; r < rows; r++) {
      const [lat, h] = profile[r];
      positions.push(points[i].x + out.x * lat, points[i].y + h, points[i].z + out.z * lat);
      uvs.push(along / uvScale, r / (rows - 1));
    }
  }
  // A orientação dos triângulos depende do lado, para que as faces apontem para fora do perfil.
  const flip = side > 0;
  for (let k = 0; k < (closed ? count - 1 : segments); k++) {
    for (let r = 0; r < rows - 1; r++) {
      const a = k * rows + r;
      const b = a + 1;
      const c = a + rows;
      const d = c + 1;
      if (flip) indices.push(a, b, c, b, d, c);
      else indices.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Geometrias de árvores (low-poly, com cores por vértice). */
function createTreeGeometries(): { pine: THREE.BufferGeometry; broadleaf: THREE.BufferGeometry; palm: THREE.BufferGeometry } {
  const colorize = (g: THREE.BufferGeometry, color: THREE.Color, variation = 0.08) => {
    const count = g.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const y = g.attributes.position.getY(i);
      const shade = 0.85 + Math.min(0.3, y * 0.03) + (Math.sin(i * 12.9898) * 0.5) * variation;
      colors[i * 3] = color.r * shade;
      colors[i * 3 + 1] = color.g * shade;
      colors[i * 3 + 2] = color.b * shade;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  };
  const trunkColor = new THREE.Color(0x5a4332);
  const pineParts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.18, 0.28, 3, 6).translate(0, 1.5, 0);
  pineParts.push(colorize(trunk, trunkColor, 0));
  const pineGreen = new THREE.Color(0x2f5a33);
  [
    [3.2, 2.6, 2.2],
    [2.6, 2.3, 4.1],
    [1.9, 2.0, 5.8],
    [1.1, 1.6, 7.3],
  ].forEach(([r, h, y]) => pineParts.push(colorize(new THREE.ConeGeometry(r, h, 7).translate(0, y, 0), pineGreen)));
  const pine = mergeGeometries(pineParts.map((g) => g.toNonIndexed()));

  const leafGreen = new THREE.Color(0x4c7a34);
  const broadParts: THREE.BufferGeometry[] = [colorize(new THREE.CylinderGeometry(0.2, 0.3, 3.2, 6).translate(0, 1.6, 0), trunkColor, 0)];
  [
    [2.4, 0, 4.4, 0],
    [1.8, 1.2, 4.0, 0.6],
    [1.7, -1.1, 4.2, -0.5],
    [1.6, 0.2, 5.6, -0.3],
  ].forEach(([r, x, y, z]) => broadParts.push(colorize(new THREE.IcosahedronGeometry(r, 0).translate(x, y, z), leafGreen, 0.12)));
  const broadleaf = mergeGeometries(broadParts.map((g) => g.toNonIndexed()));

  const palmParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    palmParts.push(colorize(new THREE.CylinderGeometry(0.16 - i * 0.012, 0.19 - i * 0.012, 1.6, 6).translate(i * 0.12, 0.8 + i * 1.55, 0), new THREE.Color(0x7a6040), 0.05));
  }
  const frond = new THREE.Color(0x3f7a3a);
  for (let k = 0; k < 7; k++) {
    const leaf = new THREE.ConeGeometry(0.45, 3.6, 4, 1);
    leaf.rotateZ(Math.PI / 2.4);
    leaf.translate(1.7, 0, 0);
    leaf.rotateY((k / 7) * Math.PI * 2);
    leaf.translate(0.6, 7.9, 0);
    palmParts.push(colorize(leaf, frond, 0.1));
  }
  const palm = mergeGeometries(palmParts.map((g) => g.toNonIndexed()));
  return { pine, broadleaf, palm };
}

export class TrackView {
  readonly group = new THREE.Group();
  private readonly startLights: THREE.Mesh[] = [];
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly rng: SeededRandom;
  private water: THREE.Mesh | null = null;
  private lightsState = -2;

  constructor(
    private readonly track: Track,
    ribbons: TrackRibbons,
    private readonly terrain: TerrainData,
    private readonly textures: TextureLibrary,
    private readonly materials: MaterialLibrary,
    private readonly options: TrackViewOptions,
  ) {
    this.group.name = `track-${track.id}`;
    this.rng = new SeededRandom(hashString(track.id));
    this.buildSurfaces(ribbons);
    this.buildTerrain();
    this.buildBarriers();
    this.buildStartArea();
    this.buildGrandstands();
    this.buildTheme();
    this.buildVegetation();
    this.buildHorizon();
  }

  private add(mesh: THREE.Object3D, castShadow = false, receiveShadow = true): void {
    mesh.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = castShadow && this.options.shadows;
        o.receiveShadow = receiveShadow;
        this.disposables.push(o.geometry);
      }
    });
    this.group.add(mesh);
  }

  private buildSurfaces(ribbons: TrackRibbons): void {
    const m = this.materials;
    this.add(new THREE.Mesh(ribbonGeometry(ribbons.road), m.road()));
    for (const r of [ribbons.curbLeft, ribbons.curbRight]) if (r.indices.length) this.add(new THREE.Mesh(ribbonGeometry(r), m.curb()));
    for (const r of [ribbons.shoulderLeft, ribbons.shoulderRight]) if (r.indices.length) this.add(new THREE.Mesh(ribbonGeometry(r), m.shoulder()));
    for (const r of [ribbons.runoffLeft, ribbons.runoffRight]) if (r.indices.length) this.add(new THREE.Mesh(ribbonGeometry(r), m.runoff()));
  }

  private buildTerrain(): void {
    const t = this.terrain;
    const positions = terrainPositions(t);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(terrainIndices(t), 1));
    geometry.computeVertexNormals();
    const count = positions.length / 3;
    const uvs = new Float32Array(count * 2);
    const colors = new Float32Array(count * 3);
    const noise = new ValueNoise2D(hashString(this.track.id) + 17);
    const theme = this.track.definition.scenery.theme;
    const lush = new THREE.Color(theme === 'industrial' ? 0x5d6b47 : 0x4f7a37);
    const dry = new THREE.Color(theme === 'industrial' ? 0x80785f : 0x8a8a4c);
    const rock = new THREE.Color(0x77736b);
    const sand = new THREE.Color(0xcdb88a);
    const asphaltLot = new THREE.Color(0x55575a);
    const normals = geometry.attributes.normal;
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      uvs[i * 2] = x / 7;
      uvs[i * 2 + 1] = z / 7;
      const n = noise.fbm(x / 90, z / 90, 3);
      c.copy(lush).lerp(dry, clamp(n * 1.3 - 0.35, 0, 1));
      const slope = 1 - normals.getY(i);
      c.lerp(rock, smoothstep(0.18, 0.45, slope));
      if (Number.isFinite(t.seaLevel)) c.lerp(sand, 1 - smoothstep(t.seaLevel + 0.6, t.seaLevel + 3.2, y));
      if (theme === 'industrial') {
        const d = t.trackDistance[i];
        c.lerp(asphaltLot, smoothstep(this.track.barrierOffset + 10, this.track.barrierOffset + 30, d) * 0.85);
      }
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    this.add(new THREE.Mesh(geometry, this.materials.terrain()), false, true);
  }

  private buildBarriers(): void {
    const concrete = this.track.definition.barrierStyle === 'concrete';
    const wallGeoms: THREE.BufferGeometry[] = [];
    const railGeoms: THREE.BufferGeometry[] = [];
    const posts: THREE.Matrix4[] = [];
    const tmp = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (const run of this.track.barriers) {
      if (run.points.length < 2) continue;
      const side = run.side === 0 ? 1 : run.side;
      if (concrete || run.side === 0) {
        // Muro: face interna, topo e face externa.
        const profile: Array<[number, number]> = [
          [0, -0.4],
          [0, BARRIER_HEIGHT * 0.15],
          [0.12, BARRIER_HEIGHT],
          [0.38, BARRIER_HEIGHT],
          [0.5, BARRIER_HEIGHT * 0.15],
          [0.5, -0.4],
        ];
        const pts = run.side === 0 ? run.points : run.points;
        wallGeoms.push(extrudeAlong(pts, profile, run.side === 0 ? this.crossBarrierSide(run.s[0]) : side, run.closedLoop, 4));
      } else {
        const profile: Array<[number, number]> = [
          [0.02, 0.42],
          [0.07, 0.55],
          [0.02, 0.68],
          [0.07, 0.8],
        ];
        railGeoms.push(extrudeAlong(run.points, profile, side, run.closedLoop, 4));
        // Postes a cada ~4 m.
        let acc = 0;
        for (let i = 1; i < run.points.length; i++) {
          acc += run.points[i].distanceTo(run.points[i - 1]);
          if (acc < 4) continue;
          acc = 0;
          const p = run.points[i];
          const prev = run.points[i - 1];
          const dir = new THREE.Vector3().subVectors(p, prev).setY(0).normalize();
          const out = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(side);
          quat.setFromAxisAngle(up, Math.atan2(dir.x, dir.z));
          tmp.compose(new THREE.Vector3(p.x + out.x * 0.16, p.y + 0.38, p.z + out.z * 0.16), quat, new THREE.Vector3(1, 1, 1));
          posts.push(tmp.clone());
        }
      }
    }
    if (wallGeoms.length) {
      const merged = mergeGeometries(wallGeoms);
      wallGeoms.forEach((g) => g.dispose());
      this.add(new THREE.Mesh(merged, this.materials.concrete()), true, true);
    }
    if (railGeoms.length) {
      const merged = mergeGeometries(railGeoms);
      railGeoms.forEach((g) => g.dispose());
      this.add(new THREE.Mesh(merged, this.materials.guardrail()), true, true);
    }
    if (posts.length) {
      const geo = new THREE.BoxGeometry(0.12, 1.15, 0.12);
      const inst = new THREE.InstancedMesh(geo, this.materials.post(), posts.length);
      posts.forEach((m, i) => inst.setMatrixAt(i, m));
      inst.computeBoundingSphere();
      this.add(inst, true, true);
    }
  }

  private crossBarrierSide(s: number): number {
    return s < this.track.length / 2 ? 1 : -1;
  }

  private buildStartArea(): void {
    const track = this.track;
    const frame = track.sampleAt(track.startS);
    const width = track.halfWidth * 2;
    const yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
    // Linha quadriculada.
    const line = new THREE.Mesh(new THREE.PlaneGeometry(width, 1.6), this.materials.decal(this.textures.checker(), 'checker'));
    line.rotation.order = 'YXZ';
    line.rotation.set(-Math.PI / 2, yaw, 0);
    line.position.copy(frame.position).addScaledVector(frame.up, 0.012);
    this.add(line);

    // Marcações do grid (mescladas em uma única malha).
    const marks: THREE.BufferGeometry[] = [];
    const dummy = new THREE.Object3D();
    dummy.rotation.order = 'YXZ';
    for (const slot of track.grid) {
      const f = track.sampleAt(slot.s);
      dummy.rotation.set(-Math.PI / 2, Math.atan2(f.tangent.x, f.tangent.z), 0);
      dummy.position.copy(f.position).addScaledVector(f.right, slot.lateral).addScaledVector(f.tangent, 2.6).addScaledVector(f.up, 0.012);
      dummy.updateMatrix();
      marks.push(new THREE.PlaneGeometry(2.4, 0.22).applyMatrix4(dummy.matrix));
    }
    if (marks.length) {
      const merged = mergeGeometries(marks);
      marks.forEach((g) => g.dispose());
      this.add(new THREE.Mesh(merged, this.materials.paint()), false, true);
    }

    // Pórtico com luzes de largada (atrás das barreiras, sem colisão com a pista).
    const span = track.barrierOffset + 1.4;
    const gantry = new THREE.Group();
    const pillarGeo = new THREE.BoxGeometry(0.6, 8, 0.6);
    for (const s of [-1, 1]) {
      const pillar = new THREE.Mesh(pillarGeo, this.materials.structure());
      pillar.position.set(s * span, 4, 0);
      gantry.add(pillar);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(span * 2 + 0.6, 1.4, 0.8), this.materials.structure());
    beam.position.set(0, 7.6, 0);
    gantry.add(beam);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(span * 1.4, 1.1), this.materials.banner('APEX VELOCITY', '#0d0f12', '#f4f4f4'));
    banner.position.set(0, 7.6, -0.41);
    banner.rotation.y = Math.PI;
    gantry.add(banner);
    const lightGeo = new THREE.CircleGeometry(0.32, 16);
    for (let i = 0; i < 5; i++) {
      const light = new THREE.Mesh(lightGeo, this.materials.lightOff());
      light.position.set((i - 2) * 0.95, 7.6, -0.42);
      light.rotation.y = Math.PI;
      gantry.add(light);
      this.startLights.push(light);
    }
    gantry.position.copy(frame.position);
    gantry.rotation.y = yaw;
    this.add(gantry, true, true);
    this.disposables.push(pillarGeo, lightGeo);

    // Faixas publicitárias (marcas fictícias) ao longo da reta principal.
    const brands: Array<[string, string, string]> = [
      ['APEX VELOCITY', '#111318', '#ffffff'],
      ['MARÉ ALTA ÓLEOS', '#0b3d6b', '#ffffff'],
      ['FAÍSCA PNEUS', '#c4161c', '#ffffff'],
      ['VILA MARÉ', '#f2c14e', '#111318'],
    ];
    const bannersByBrand = new Map<string, { material: THREE.Material; geos: THREE.BufferGeometry[] }>();
    for (const run of track.barriers) {
      if (run.side === 0) continue;
      for (let i = 0; i < run.points.length - 1; i += 4) {
        const d = track.raceDistance(run.s[i]);
        const near = track.closed ? Math.min(d, track.raceLength - d) : Math.abs(d);
        if (near > 160) continue;
        const a = run.points[i];
        const b = run.points[Math.min(i + 2, run.points.length - 1)];
        const dir = new THREE.Vector3().subVectors(b, a).setY(0).normalize();
        const brand = brands[Math.floor(this.rng.next() * brands.length)];
        const inward = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(-run.side);
        dummy.rotation.set(0, 0, 0);
        dummy.position.copy(a).add(b).multiplyScalar(0.5).addScaledVector(inward, 0.05);
        dummy.position.y += 1.6;
        dummy.lookAt(dummy.position.clone().add(inward));
        dummy.updateMatrix();
        let entry = bannersByBrand.get(brand[0]);
        if (!entry) {
          entry = { material: this.materials.banner(brand[0], brand[1], brand[2]), geos: [] };
          bannersByBrand.set(brand[0], entry);
        }
        entry.geos.push(new THREE.PlaneGeometry(7.6, 0.9).applyMatrix4(dummy.matrix));
      }
    }
    for (const { material, geos } of bannersByBrand.values()) {
      const merged = mergeGeometries(geos);
      geos.forEach((g) => g.dispose());
      this.add(new THREE.Mesh(merged, material), false, true);
    }
  }

  /** Atualiza as luzes de largada: 0..5 acesas em vermelho; -1 = verde; -2 = apagadas. */
  setStartLights(state: number): void {
    if (state === this.lightsState) return;
    this.lightsState = state;
    for (let i = 0; i < this.startLights.length; i++) {
      const mesh = this.startLights[i];
      if (state === -1) mesh.material = this.materials.lightGreen();
      else if (state >= 0 && i < state) mesh.material = this.materials.lightRed();
      else mesh.material = this.materials.lightOff();
    }
  }

  private freeSideAt(s: number): number {
    const track = this.track;
    const frame = track.sampleAt(s);
    let best = 1;
    let bestDist = -1;
    for (const side of [-1, 1]) {
      const p = frame.position.clone().addScaledVector(frame.right, side * (track.barrierOffset + 18));
      const d = terrainTrackDistanceAt(this.terrain, p.x, p.z);
      if (d > bestDist) {
        bestDist = d;
        best = side;
      }
    }
    return best;
  }

  private buildGrandstands(): void {
    const track = this.track;
    for (const fraction of track.definition.scenery.grandstands) {
      const s = track.sFromRaceDistance(fraction * track.raceLength);
      const side = this.freeSideAt(s);
      const frame = track.sampleAt(s);
      const stand = new THREE.Group();
      const length = 46;
      const rows = 7;
      const stepDepth = 1.1;
      const stepHeight = 0.55;
      const structGeos: THREE.BufferGeometry[] = [];
      for (let r = 0; r < rows; r++) {
        structGeos.push(new THREE.BoxGeometry(length, stepHeight * (r + 1), stepDepth).translate(0, (stepHeight * (r + 1)) / 2, r * stepDepth));
      }
      const base = new THREE.Mesh(mergeGeometries(structGeos), this.materials.structureLight());
      structGeos.forEach((g) => g.dispose());
      stand.add(base);
      // Público (plano inclinado com textura).
      const slopeLen = Math.hypot(rows * stepDepth, rows * stepHeight);
      const crowd = new THREE.Mesh(new THREE.PlaneGeometry(length - 1, slopeLen), this.materials.crowd());
      crowd.position.set(0, (rows * stepHeight) / 2 + 0.6, ((rows - 1) * stepDepth) / 2);
      // Plano inclinado subindo para longe da pista, voltado para a pista (-Z local) e para cima.
      crowd.rotation.x = -(Math.PI / 2 + Math.atan2(rows * stepHeight, rows * stepDepth));
      stand.add(crowd);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(length + 2, 0.3, rows * stepDepth + 2), this.materials.structure());
      roof.position.set(0, rows * stepHeight + 4.2, ((rows - 1) * stepDepth) / 2);
      stand.add(roof);
      for (const x of [-length / 2, 0, length / 2]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.4, rows * stepHeight + 4.2, 0.4), this.materials.structure());
        pillar.position.set(x, (rows * stepHeight + 4.2) / 2, (rows - 0.5) * stepDepth);
        stand.add(pillar);
      }
      const pos = frame.position.clone().addScaledVector(frame.right, side * (track.barrierOffset + 6));
      pos.y = terrainHeightAt(this.terrain, pos.x, pos.z) - 0.2;
      stand.position.copy(pos);
      // A arquibancada "olha" para a pista: seu eixo +Z aponta para longe da pista.
      const away = frame.right.clone().multiplyScalar(side).setY(0).normalize();
      stand.rotation.y = Math.atan2(away.x, away.z);
      this.add(stand, true, true);
    }
  }

  private buildTheme(): void {
    const theme = this.track.definition.scenery.theme;
    if (theme === 'coastal') this.buildCoastal();
    if (theme === 'industrial') this.buildIndustrial();
  }

  private buildCoastal(): void {
    const t = this.terrain;
    if (Number.isFinite(t.seaLevel)) {
      const size = 9000;
      const water = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1), this.materials.water());
      water.rotation.x = -Math.PI / 2;
      water.position.set((this.track.bounds.minX + this.track.bounds.maxX) / 2, t.seaLevel, (this.track.bounds.minZ + this.track.bounds.maxZ) / 2);
      water.receiveShadow = true;
      this.water = water;
      this.add(water, false, true);
    }
    // Farol (marco visual próximo à primeira curva).
    const gate = this.track.gates[Math.min(2, this.track.gates.length - 1)];
    const s = gate.s;
    const side = this.freeSideAt(s);
    const frame = this.track.sampleAt(s);
    const pos = frame.position.clone().addScaledVector(frame.right, side * (this.track.barrierOffset + 40));
    pos.y = terrainHeightAt(t, pos.x, pos.z);
    const lighthouse = new THREE.Group();
    const stripes = 6;
    for (let i = 0; i < stripes; i++) {
      const r0 = 2.6 - i * 0.22;
      const r1 = 2.6 - (i + 1) * 0.22;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 3.4, 16), i % 2 === 0 ? this.materials.structureLight() : this.materials.paintRed());
      seg.position.y = 1.7 + i * 3.4;
      lighthouse.add(seg);
    }
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2, 12), this.materials.lamp());
    lamp.position.y = stripes * 3.4 + 1;
    lighthouse.add(lamp);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.8, 12), this.materials.structure());
    cap.position.y = stripes * 3.4 + 2.9;
    lighthouse.add(cap);
    lighthouse.position.copy(pos);
    this.add(lighthouse, true, true);
  }

  private buildIndustrial(): void {
    const track = this.track;
    const t = this.terrain;
    const rng = this.rng;
    const containerGeo = new THREE.BoxGeometry(2.45, 2.6, 6.1);
    const containerColors = [0xb3121c, 0x1f5f9e, 0x2e7d4f, 0xd9a21e, 0x8a8f96, 0xd9631e, 0x5b3a7a];
    const matrices: THREE.Matrix4[] = [];
    const colors: THREE.Color[] = [];
    const warehouses: THREE.BufferGeometry[] = [];
    const roofs: THREE.BufferGeometry[] = [];
    const tries = Math.round(260 * this.options.sceneryDensity + 60);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < tries; i++) {
      const s = rng.range(0, track.length);
      const side = rng.chance(0.5) ? 1 : -1;
      const frame = track.sampleAt(s);
      const lateral = side * (track.barrierOffset + rng.range(8, 70));
      const p = frame.position.clone().addScaledVector(frame.right, lateral);
      const clearance = terrainTrackDistanceAt(t, p.x, p.z);
      if (clearance < track.barrierOffset + 7) continue;
      const yaw = Math.atan2(frame.tangent.x, frame.tangent.z) + (rng.chance(0.3) ? Math.PI / 2 : 0);
      const ground = terrainHeightAt(t, p.x, p.z);
      if (rng.chance(0.18) && clearance > track.barrierOffset + 30) {
        const w = rng.range(18, 34);
        const d = rng.range(26, 50);
        const h = rng.range(8, 13);
        const box = new THREE.BoxGeometry(w, h, d);
        box.rotateY(yaw);
        box.translate(p.x, ground + h / 2 - 0.3, p.z);
        warehouses.push(box);
        const roof = new THREE.CylinderGeometry(w / 2, w / 2, d, 10, 1, false, 0, Math.PI);
        roof.rotateZ(Math.PI / 2);
        roof.rotateX(Math.PI / 2);
        roof.scale(1, 0.25, 1);
        roof.rotateY(yaw);
        roof.translate(p.x, ground + h - 0.3, p.z);
        roofs.push(roof);
        continue;
      }
      const stack = rng.int(1, 3);
      for (let k = 0; k < stack; k++) {
        q.setFromAxisAngle(up, yaw + rng.range(-0.05, 0.05));
        m.compose(new THREE.Vector3(p.x, ground + 1.3 + k * 2.6, p.z), q, new THREE.Vector3(1, 1, 1));
        matrices.push(m.clone());
        colors.push(new THREE.Color(containerColors[rng.int(0, containerColors.length - 1)]));
      }
    }
    if (matrices.length) {
      const inst = new THREE.InstancedMesh(containerGeo, this.materials.corrugated(), matrices.length);
      matrices.forEach((mat, i) => {
        inst.setMatrixAt(i, mat);
        inst.setColorAt(i, colors[i]);
      });
      inst.computeBoundingSphere();
      this.add(inst, true, true);
    }
    if (warehouses.length) {
      const merged = mergeGeometries(warehouses);
      warehouses.forEach((g) => g.dispose());
      this.add(new THREE.Mesh(merged, this.materials.corrugated()), true, true);
      const mergedRoofs = mergeGeometries(roofs);
      roofs.forEach((g) => g.dispose());
      this.add(new THREE.Mesh(mergedRoofs, this.materials.structure()), true, true);
    }
    // Guindastes portuários ao fundo.
    for (let i = 0; i < 3; i++) {
      const crane = new THREE.Group();
      const legGeo = new THREE.BoxGeometry(1, 34, 1);
      for (const [x, z] of [
        [-6, -6],
        [6, -6],
        [-6, 6],
        [6, 6],
      ]) {
        const leg = new THREE.Mesh(legGeo, this.materials.crane());
        leg.position.set(x, 17, z);
        crane.add(leg);
      }
      const boom = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 70), this.materials.crane());
      boom.position.set(0, 35, 18);
      crane.add(boom);
      const b = track.bounds;
      crane.position.set(b.maxX + 60 + i * 45, 0, b.minZ + 40 + i * 70);
      crane.position.y = terrainHeightAt(t, crane.position.x, crane.position.z);
      crane.rotation.y = -Math.PI / 2;
      this.add(crane, true, false);
    }
  }

  private buildVegetation(): void {
    const track = this.track;
    const t = this.terrain;
    const def = track.definition.scenery;
    const density = def.treeDensity * this.options.sceneryDensity;
    if (density <= 0) return;
    const { pine, broadleaf, palm } = createTreeGeometries();
    this.disposables.push(pine, broadleaf, palm);
    const types =
      def.theme === 'coastal'
        ? [
            { geo: palm, weight: 0.45 },
            { geo: broadleaf, weight: 0.55 },
          ]
        : def.theme === 'forest'
          ? [
              { geo: pine, weight: 0.75 },
              { geo: broadleaf, weight: 0.25 },
            ]
          : [{ geo: broadleaf, weight: 1 }];
    const cellSize = 160;
    const cells = new Map<string, Array<{ type: number; matrix: THREE.Matrix4 }>>();
    const areaHa = ((t.cols * t.cellSize) * (t.rows * t.cellSize)) / 10000;
    const target = Math.min(5000, Math.round(areaHa * density * 0.35));
    const rng = this.rng;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const noise = new ValueNoise2D(hashString(track.id) + 99);
    let placed = 0;
    for (let attempt = 0; attempt < target * 4 && placed < target; attempt++) {
      const x = t.originX + rng.next() * t.cols * t.cellSize;
      const z = t.originZ + rng.next() * t.rows * t.cellSize;
      const d = terrainTrackDistanceAt(t, x, z);
      if (d < track.barrierOffset + 7) continue;
      // Agrupamentos naturais (bosques).
      if (noise.fbm(x / 140, z / 140, 3) < 0.42) continue;
      const y = terrainHeightAt(t, x, z);
      if (Number.isFinite(t.seaLevel) && y < t.seaLevel + 1.2) continue;
      let r = rng.next();
      let type = 0;
      for (let k = 0; k < types.length; k++) {
        if (r < types[k].weight) {
          type = k;
          break;
        }
        r -= types[k].weight;
      }
      const scale = rng.range(0.75, 1.35);
      q.setFromAxisAngle(up, rng.range(0, Math.PI * 2));
      m.compose(new THREE.Vector3(x, y - 0.2, z), q, new THREE.Vector3(scale, scale * rng.range(0.9, 1.2), scale));
      const key = `${Math.floor(x / cellSize)}:${Math.floor(z / cellSize)}`;
      let list = cells.get(key);
      if (!list) {
        list = [];
        cells.set(key, list);
      }
      list.push({ type, matrix: m.clone() });
      placed++;
    }
    const material = this.materials.foliage();
    for (const list of cells.values()) {
      for (let k = 0; k < types.length; k++) {
        const items = list.filter((it) => it.type === k);
        if (!items.length) continue;
        const inst = new THREE.InstancedMesh(types[k].geo, material, items.length);
        items.forEach((it, i) => inst.setMatrixAt(i, it.matrix));
        inst.computeBoundingSphere();
        inst.castShadow = this.options.shadows;
        inst.receiveShadow = false;
        this.group.add(inst);
      }
    }
  }

  private buildHorizon(): void {
    const t = this.terrain;
    const b = this.track.bounds;
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    // Plano distante na altura do horizonte (emenda com as bordas do terreno).
    if (!Number.isFinite(t.seaLevel)) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(6000, 48), new THREE.MeshStandardMaterial({ color: 0x4a6a3a, roughness: 1 }));
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(cx, t.horizonHeight - 0.75, cz);
      this.add(disc, false, false);
      this.disposables.push(disc.material as THREE.Material);
    }
    // Anel de montanhas.
    const theme = this.track.definition.scenery.theme;
    const segments = 96;
    const radius = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.5 + 900;
    const positions: number[] = [];
    const colors: number[] = [];
    const noise = new ValueNoise2D(hashString(this.track.id) + 3);
    const base = new THREE.Color(theme === 'coastal' ? 0x5d7a68 : theme === 'industrial' ? 0x6d7480 : 0x3f5f45);
    const peak = new THREE.Color(theme === 'industrial' ? 0x8a919c : 0x8796a0);
    const seaDir = this.track.definition.scenery.seaDirection;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      let h = 60 + noise.fbm(Math.cos(a) * 3 + 10, Math.sin(a) * 3 + 10, 4) * (theme === 'industrial' ? 90 : 260);
      if (seaDir && dx * seaDir[0] + dz * seaDir[1] > 0.2) h *= 0.05;
      const r = radius + noise.sample(i * 0.3, 5) * 300;
      positions.push(cx + dx * r, t.horizonHeight - 10, cz + dz * r);
      positions.push(cx + dx * (r + 200), t.horizonHeight + h, cz + dz * (r + 200));
      colors.push(base.r, base.g, base.b, peak.r, peak.g, peak.b);
    }
    const indices: number[] = [];
    for (let i = 0; i < segments; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    const mountains = new THREE.Mesh(g, this.materials.mountains());
    mountains.material.side = THREE.DoubleSide;
    this.add(mountains, false, false);
  }

  update(elapsed: number): void {
    if (this.water) {
      const mat = this.water.material as THREE.MeshStandardMaterial;
      if (mat.normalMap) mat.normalMap.offset.set(elapsed * 0.004, elapsed * 0.0025);
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh) {
        o.geometry.dispose();
        if (o instanceof THREE.InstancedMesh) o.dispose();
      }
    });
    this.group.removeFromParent();
  }
}
