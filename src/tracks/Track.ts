/**
 * Representação de uma pista em tempo de execução (sem renderização).
 * Fornece consultas rápidas: projeção de um ponto na linha central, amostragem por distância,
 * distância de corrida, zebras e limites. Usada pela física, regras de corrida, IA e câmera.
 */
import { Vector3 } from 'three';
import { wrap } from '../utils/math';
import type { BarrierRun, CurbRange, Gate, GridSlot, TrackBounds, TrackDefinition } from './TrackConfig';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface TrackSampleArrays {
  count: number;
  px: Float32Array;
  py: Float32Array;
  pz: Float32Array;
  tx: Float32Array;
  ty: Float32Array;
  tz: Float32Array;
  rx: Float32Array;
  ry: Float32Array;
  rz: Float32Array;
  ux: Float32Array;
  uy: Float32Array;
  uz: Float32Array;
  curvature: Float32Array;
  s: Float32Array;
}

export interface TrackProjection {
  /** Índice da amostra inicial do segmento mais próximo. */
  index: number;
  /** Fração ao longo do segmento. */
  t: number;
  /** Distância ao longo da spline. */
  s: number;
  /** Deslocamento lateral (+ direita). */
  lateral: number;
  /** Altura acima da superfície da linha central. */
  vertical: number;
  onRoad: boolean;
  insideBarriers: boolean;
}

export interface TrackFrame {
  position: Vector3;
  tangent: Vector3;
  right: Vector3;
  up: Vector3;
}

export function createProjection(): TrackProjection {
  return { index: 0, t: 0, s: 0, lateral: 0, vertical: 0, onRoad: true, insideBarriers: true };
}

export function createFrame(): TrackFrame {
  return { position: new Vector3(), tangent: new Vector3(0, 0, 1), right: new Vector3(-1, 0, 0), up: new Vector3(0, 1, 0) };
}

/** Índice espacial em grade (formato CSR) para encontrar amostras próximas rapidamente. */
export class SpatialIndex {
  readonly cellSize: number;
  readonly minX: number;
  readonly minZ: number;
  readonly cols: number;
  readonly rows: number;
  private readonly offsets: Int32Array;
  private readonly items: Int32Array;

  constructor(px: Float32Array, pz: Float32Array, count: number, cellSize = 16) {
    this.cellSize = cellSize;
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < count; i++) {
      minX = Math.min(minX, px[i]);
      maxX = Math.max(maxX, px[i]);
      minZ = Math.min(minZ, pz[i]);
      maxZ = Math.max(maxZ, pz[i]);
    }
    this.minX = minX - cellSize;
    this.minZ = minZ - cellSize;
    this.cols = Math.max(1, Math.ceil((maxX - this.minX + cellSize) / cellSize));
    this.rows = Math.max(1, Math.ceil((maxZ - this.minZ + cellSize) / cellSize));
    const cellCount = this.cols * this.rows;
    const counts = new Int32Array(cellCount + 1);
    const cellOf = new Int32Array(count);
    for (let i = 0; i < count; i++) {
      const c = this.cellIndex(px[i], pz[i]);
      cellOf[i] = c;
      counts[c + 1]++;
    }
    for (let c = 0; c < cellCount; c++) counts[c + 1] += counts[c];
    this.offsets = counts;
    this.items = new Int32Array(count);
    const cursor = counts.slice(0, cellCount);
    for (let i = 0; i < count; i++) {
      this.items[cursor[cellOf[i]]++] = i;
    }
  }

  private cellIndex(x: number, z: number): number {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.minX) / this.cellSize)));
    const cz = Math.min(this.rows - 1, Math.max(0, Math.floor((z - this.minZ) / this.cellSize)));
    return cz * this.cols + cx;
  }

  forEachNear(x: number, z: number, radius: number, callback: (index: number) => void): void {
    const r = Math.ceil(radius / this.cellSize);
    const cx = Math.floor((x - this.minX) / this.cellSize);
    const cz = Math.floor((z - this.minZ) / this.cellSize);
    for (let dz = -r; dz <= r; dz++) {
      const zz = cz + dz;
      if (zz < 0 || zz >= this.rows) continue;
      for (let dx = -r; dx <= r; dx++) {
        const xx = cx + dx;
        if (xx < 0 || xx >= this.cols) continue;
        const cell = zz * this.cols + xx;
        for (let k = this.offsets[cell]; k < this.offsets[cell + 1]; k++) callback(this.items[k]);
      }
    }
  }
}

export interface TrackInit {
  definition: TrackDefinition;
  closed: boolean;
  length: number;
  samples: TrackSampleArrays;
  startS: number;
  finishS: number;
  raceLength: number;
}

export class Track {
  readonly definition: TrackDefinition;
  readonly closed: boolean;
  /** Comprimento total da spline (m). */
  readonly length: number;
  readonly samples: TrackSampleArrays;
  readonly halfWidth: number;
  readonly shoulderWidth: number;
  readonly runoffWidth: number;
  /** Distância lateral da linha central até a face interna das barreiras. */
  readonly barrierOffset: number;
  readonly startS: number;
  readonly finishS: number;
  /** Comprimento de uma volta (circuito) ou do trecho largada→chegada (sprint). */
  readonly raceLength: number;
  gates: Gate[] = [];
  grid: GridSlot[] = [];
  barriers: BarrierRun[] = [];
  curbs: CurbRange[] = [];
  bounds: TrackBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
  readonly spatial: SpatialIndex;

  constructor(init: TrackInit) {
    this.definition = init.definition;
    this.closed = init.closed;
    this.length = init.length;
    this.samples = init.samples;
    this.halfWidth = init.definition.width / 2;
    this.shoulderWidth = init.definition.shoulderWidth;
    this.runoffWidth = init.definition.runoffWidth;
    this.barrierOffset = this.halfWidth + this.shoulderWidth + this.runoffWidth;
    this.startS = init.startS;
    this.finishS = init.finishS;
    this.raceLength = init.raceLength;
    this.spatial = new SpatialIndex(init.samples.px, init.samples.pz, init.samples.count);
  }

  get id(): string {
    return this.definition.id;
  }

  wrapS(s: number): number {
    return this.closed ? wrap(s, this.length) : Math.min(Math.max(s, 0), this.length);
  }

  wrapIndex(i: number): number {
    const n = this.samples.count;
    return this.closed ? ((i % n) + n) % n : Math.min(Math.max(i, 0), n - 1);
  }

  /** Distância de corrida (a partir da linha de largada) correspondente a uma distância da spline. */
  raceDistance(s: number): number {
    if (this.closed) return wrap(s - this.startS, this.length);
    return s - this.startS;
  }

  sFromRaceDistance(distance: number): number {
    return this.wrapS(this.startS + distance);
  }

  private distSq(i: number, p: Vec3Like): number {
    const S = this.samples;
    const dx = S.px[i] - p.x;
    const dy = (S.py[i] - p.y) * 0.6;
    const dz = S.pz[i] - p.z;
    return dx * dx + dy * dy + dz * dz;
  }

  /** Índice da amostra mais próxima. Usa a dica (`hint`) para busca local contínua. */
  nearestIndex(p: Vec3Like, hint = -1): number {
    const n = this.samples.count;
    let best = -1;
    let bestD = Infinity;
    if (hint >= 0 && hint < n) {
      const window = 60;
      let bestK = 0;
      for (let k = -window; k <= window; k++) {
        let i = hint + k;
        if (this.closed) i = ((i % n) + n) % n;
        else if (i < 0 || i >= n) continue;
        const d = this.distSq(i, p);
        if (d < bestD) {
          bestD = d;
          best = i;
          bestK = k;
        }
      }
      const limit = this.barrierOffset + 30;
      const atEdge = Math.abs(bestK) === window;
      if (bestD <= limit * limit && !atEdge) return best;
      best = -1;
      bestD = Infinity;
    }
    this.spatial.forEachNear(p.x, p.z, 64, (i) => {
      const d = this.distSq(i, p);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0) return best;
    for (let i = 0; i < n; i++) {
      const d = this.distSq(i, p);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /** Projeta um ponto na linha central da pista. */
  project(p: Vec3Like, hint = -1, out: TrackProjection = createProjection()): TrackProjection {
    const S = this.samples;
    const n = S.count;
    const i = this.nearestIndex(p, hint);

    // Avalia os dois segmentos adjacentes e escolhe o mais próximo.
    let segStart = i;
    let t = 0;
    let bestD = Infinity;
    for (const a of [i - 1, i]) {
      let ia = a;
      let ib = a + 1;
      if (this.closed) {
        ia = ((ia % n) + n) % n;
        ib = ((ib % n) + n) % n;
      } else if (ia < 0 || ib >= n) {
        continue;
      }
      const ax = S.px[ia];
      const az = S.pz[ia];
      const abx = S.px[ib] - ax;
      const abz = S.pz[ib] - az;
      const len2 = abx * abx + abz * abz;
      let tt = len2 > 1e-9 ? ((p.x - ax) * abx + (p.z - az) * abz) / len2 : 0;
      tt = Math.min(1, Math.max(0, tt));
      const cx = ax + abx * tt - p.x;
      const cz = az + abz * tt - p.z;
      const d = cx * cx + cz * cz;
      if (d < bestD) {
        bestD = d;
        segStart = ia;
        t = tt;
      }
    }

    const ia = segStart;
    const ib = this.closed ? (ia + 1) % n : Math.min(ia + 1, n - 1);
    const sa = S.s[ia];
    const sb = ib === 0 && this.closed ? this.length : S.s[ib];
    const cx = S.px[ia] + (S.px[ib] - S.px[ia]) * t;
    const cy = S.py[ia] + (S.py[ib] - S.py[ia]) * t;
    const cz = S.pz[ia] + (S.pz[ib] - S.pz[ia]) * t;
    let rx = S.rx[ia] + (S.rx[ib] - S.rx[ia]) * t;
    let ry = S.ry[ia] + (S.ry[ib] - S.ry[ia]) * t;
    let rz = S.rz[ia] + (S.rz[ib] - S.rz[ia]) * t;
    const rl = Math.hypot(rx, ry, rz) || 1;
    rx /= rl;
    ry /= rl;
    rz /= rl;
    const ux = S.ux[ia] + (S.ux[ib] - S.ux[ia]) * t;
    const uy = S.uy[ia] + (S.uy[ib] - S.uy[ia]) * t;
    const uz = S.uz[ia] + (S.uz[ib] - S.uz[ia]) * t;

    const dx = p.x - cx;
    const dy = p.y - cy;
    const dz = p.z - cz;
    out.index = ia;
    out.t = t;
    out.s = sa + (sb - sa) * t;
    out.lateral = dx * rx + dy * ry + dz * rz;
    out.vertical = dx * ux + dy * uy + dz * uz;
    out.onRoad = Math.abs(out.lateral) <= this.halfWidth + this.shoulderWidth;
    out.insideBarriers = Math.abs(out.lateral) <= this.barrierOffset + 0.5;
    return out;
  }

  /** Índice da amostra imediatamente anterior a uma distância `s` (busca binária). */
  indexAt(s: number): number {
    const S = this.samples;
    const n = S.count;
    const ss = this.wrapS(s);
    let lo = 0;
    let hi = n - 1;
    if (ss >= S.s[hi]) return hi;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (S.s[mid] <= ss) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Amostra interpolada da linha central em uma distância `s`. */
  sampleAt(s: number, out: TrackFrame = createFrame()): TrackFrame {
    const S = this.samples;
    const n = S.count;
    const ss = this.wrapS(s);
    const ia = this.indexAt(ss);
    let ib = ia + 1;
    let sb: number;
    if (ib >= n) {
      if (this.closed) {
        ib = 0;
        sb = this.length;
      } else {
        ib = n - 1;
        sb = S.s[ib] + 1;
      }
    } else {
      sb = S.s[ib];
    }
    const span = sb - S.s[ia];
    const t = span > 1e-6 ? Math.min(1, Math.max(0, (ss - S.s[ia]) / span)) : 0;
    out.position.set(
      S.px[ia] + (S.px[ib] - S.px[ia]) * t,
      S.py[ia] + (S.py[ib] - S.py[ia]) * t,
      S.pz[ia] + (S.pz[ib] - S.pz[ia]) * t,
    );
    out.tangent
      .set(S.tx[ia] + (S.tx[ib] - S.tx[ia]) * t, S.ty[ia] + (S.ty[ib] - S.ty[ia]) * t, S.tz[ia] + (S.tz[ib] - S.tz[ia]) * t)
      .normalize();
    out.right
      .set(S.rx[ia] + (S.rx[ib] - S.rx[ia]) * t, S.ry[ia] + (S.ry[ib] - S.ry[ia]) * t, S.rz[ia] + (S.rz[ib] - S.rz[ia]) * t)
      .normalize();
    out.up.crossVectors(out.right, out.tangent).normalize();
    return out;
  }

  /** Ponto da pista com deslocamento lateral. */
  pointAt(s: number, lateral: number, out: Vector3 = new Vector3(), frame: TrackFrame = createFrame()): Vector3 {
    this.sampleAt(s, frame);
    return out.copy(frame.position).addScaledVector(frame.right, lateral);
  }

  curvatureAt(s: number): number {
    return this.samples.curvature[this.indexAt(s)];
  }

  isCurb(s: number): boolean {
    const ss = this.wrapS(s);
    for (const curb of this.curbs) {
      if (curb.startS <= curb.endS) {
        if (ss >= curb.startS && ss <= curb.endS) return true;
      } else if (ss >= curb.startS || ss <= curb.endS) {
        return true;
      }
    }
    return false;
  }
}
