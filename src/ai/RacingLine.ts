/**
 * Linha de corrida e perfil de velocidade.
 * A linha é obtida minimizando a curvatura (suavização biharmônica com restrição de largura),
 * o que naturalmente abre na entrada, tangencia o ápice e abre na saída das curvas.
 * O perfil de velocidade respeita a aderência lateral (com downforce) e a distância de frenagem.
 */
import { clamp, GRAVITY, wrap } from '../utils/math';
import type { Track } from '../tracks/Track';

export interface RacingLineOptions {
  spacing?: number;
  margin?: number;
  iterations?: number;
}

export class RacingLine {
  readonly track: Track;
  readonly count: number;
  readonly spacing: number;
  readonly s: Float32Array;
  readonly offset: Float32Array;
  readonly curvature: Float32Array;
  readonly px: Float32Array;
  readonly pz: Float32Array;
  readonly limit: number;

  constructor(track: Track, options: RacingLineOptions = {}) {
    this.track = track;
    const spacing = options.spacing ?? 4;
    const count = track.closed ? Math.round(track.length / spacing) : Math.floor(track.length / spacing) + 1;
    this.count = count;
    this.spacing = track.length / (track.closed ? count : count - 1);
    this.limit = track.halfWidth - (options.margin ?? 1.7);
    this.s = new Float32Array(count);
    this.offset = new Float32Array(count);
    this.curvature = new Float32Array(count);
    this.px = new Float32Array(count);
    this.pz = new Float32Array(count);

    const cx = new Float32Array(count);
    const cz = new Float32Array(count);
    const rx = new Float32Array(count);
    const rz = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const s = Math.min(i * this.spacing, track.length);
      this.s[i] = s;
      const frame = track.sampleAt(s);
      cx[i] = frame.position.x;
      cz[i] = frame.position.z;
      const rl = Math.hypot(frame.right.x, frame.right.z) || 1;
      rx[i] = frame.right.x / rl;
      rz[i] = frame.right.z / rl;
    }

    const o = this.offset;
    const idx = (i: number) => (track.closed ? ((i % count) + count) % count : clamp(i, 0, count - 1));
    const iterations = options.iterations ?? 2500;
    const limit = this.limit;
    for (let it = 0; it < iterations; it++) {
      for (let i = 0; i < count; i++) {
        if (!track.closed && (i < 2 || i > count - 3)) {
          o[i] = 0;
          continue;
        }
        const a = idx(i - 2);
        const b = idx(i - 1);
        const c = idx(i + 1);
        const d = idx(i + 2);
        // Posição que minimiza a segunda diferença (curvatura) dados os vizinhos.
        const tx = (-(cx[a] + o[a] * rx[a]) + 4 * (cx[b] + o[b] * rx[b]) + 4 * (cx[c] + o[c] * rx[c]) - (cx[d] + o[d] * rx[d])) / 6;
        const tz = (-(cz[a] + o[a] * rz[a]) + 4 * (cz[b] + o[b] * rz[b]) + 4 * (cz[c] + o[c] * rz[c]) - (cz[d] + o[d] * rz[d])) / 6;
        const target = (tx - cx[i]) * rx[i] + (tz - cz[i]) * rz[i];
        o[i] = clamp(o[i] + (target - o[i]) * 0.6, -limit, limit);
      }
    }

    for (let i = 0; i < count; i++) {
      this.px[i] = cx[i] + o[i] * rx[i];
      this.pz[i] = cz[i] + o[i] * rz[i];
    }
    // Curvatura da linha (círculo por três pontos), suavizada.
    const raw = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = idx(i - 2);
      const b = i;
      const c = idx(i + 2);
      const abx = this.px[b] - this.px[a];
      const abz = this.pz[b] - this.pz[a];
      const bcx = this.px[c] - this.px[b];
      const bcz = this.pz[c] - this.pz[b];
      const acx = this.px[c] - this.px[a];
      const acz = this.pz[c] - this.pz[a];
      const cross = abx * bcz - abz * bcx;
      const denom = Math.hypot(abx, abz) * Math.hypot(bcx, bcz) * Math.hypot(acx, acz);
      // Sinal: no plano XZ com heading = atan2(x, z), virar à esquerda (+X) dá produto negativo aqui.
      raw[i] = denom > 1e-6 ? (-2 * cross) / denom : 0;
    }
    for (let i = 0; i < count; i++) {
      let sum = 0;
      for (let k = -2; k <= 2; k++) sum += raw[idx(i + k)];
      this.curvature[i] = sum / 5;
    }
  }

  private nodeAt(s: number): { i0: number; i1: number; t: number } {
    const track = this.track;
    const ss = track.closed ? wrap(s, track.length) : clamp(s, 0, track.length);
    const f = ss / this.spacing;
    let i0 = Math.floor(f);
    const t = f - i0;
    let i1 = i0 + 1;
    if (track.closed) {
      i0 %= this.count;
      i1 %= this.count;
    } else {
      i0 = Math.min(i0, this.count - 1);
      i1 = Math.min(i1, this.count - 1);
    }
    return { i0, i1, t };
  }

  offsetAt(s: number): number {
    const { i0, i1, t } = this.nodeAt(s);
    return this.offset[i0] + (this.offset[i1] - this.offset[i0]) * t;
  }

  curvatureAt(s: number): number {
    const { i0, i1, t } = this.nodeAt(s);
    return this.curvature[i0] + (this.curvature[i1] - this.curvature[i0]) * t;
  }

  /** Gera o perfil de velocidade para um carro/dificuldade. */
  speedProfile(params: SpeedProfileParams): SpeedProfile {
    return new SpeedProfile(this, params);
  }
}

export interface SpeedProfileParams {
  /** Aderência lateral efetiva (coeficiente). */
  lateralGrip: number;
  /** Desaceleração de frenagem utilizável (m/s²). */
  brakeDecel: number;
  /** Downforce dividido pela massa (1/m). */
  downforcePerMass: number;
  topSpeed: number;
}

export class SpeedProfile {
  readonly speeds: Float32Array;

  constructor(
    private readonly line: RacingLine,
    params: SpeedProfileParams,
  ) {
    const n = line.count;
    const v = new Float32Array(n);
    const mu = params.lateralGrip;
    for (let i = 0; i < n; i++) {
      const k = Math.max(Math.abs(line.curvature[i]), 1e-5);
      // v²·k = mu·(g + d·v²)  =>  v² = mu·g / (k − mu·d)
      const denom = k - mu * params.downforcePerMass;
      const vMax = denom > 1e-6 ? Math.sqrt((mu * GRAVITY) / denom) : params.topSpeed;
      v[i] = Math.min(vMax, params.topSpeed);
    }
    // Transições rápidas de direção (esses) transferem peso de um lado para o outro: reduz a velocidade.
    const window = 12;
    const adjusted = new Float32Array(v);
    for (let i = 0; i < n; i++) {
      const ki = line.curvature[i];
      if (Math.abs(ki) < 0.004) continue;
      let worst = 0;
      for (let k = -window; k <= window; k++) {
        let j = i + k;
        if (line.track.closed) j = ((j % n) + n) % n;
        else if (j < 0 || j >= n) continue;
        const kj = line.curvature[j];
        if (Math.sign(kj) !== Math.sign(ki) && Math.abs(kj) > 0.004) worst = Math.max(worst, Math.min(Math.abs(ki), Math.abs(kj)));
      }
      if (worst > 0) adjusted[i] = v[i] * (1 - Math.min(0.12, (worst - 0.004) * 14));
    }
    v.set(adjusted);
    // Passada de frenagem (de trás para frente), duas voltas para circuitos fechados.
    const passes = line.track.closed ? 2 : 1;
    for (let p = 0; p < passes; p++) {
      for (let k = n - 1; k >= 0; k--) {
        const i = k;
        let next = i + 1;
        if (next >= n) {
          if (!line.track.closed) continue;
          next = 0;
        }
        const allowed = Math.sqrt(v[next] * v[next] + 2 * params.brakeDecel * line.spacing);
        if (v[i] > allowed) v[i] = allowed;
      }
    }
    this.speeds = v;
  }

  speedAt(s: number): number {
    const line = this.line;
    const track = line.track;
    const ss = track.closed ? wrap(s, track.length) : clamp(s, 0, track.length);
    const f = ss / line.spacing;
    let i0 = Math.floor(f);
    const t = f - i0;
    let i1 = i0 + 1;
    if (track.closed) {
      i0 %= line.count;
      i1 %= line.count;
    } else {
      i0 = Math.min(i0, line.count - 1);
      i1 = Math.min(i1, line.count - 1);
    }
    return this.speeds[i0] + (this.speeds[i1] - this.speeds[i0]) * t;
  }
}
