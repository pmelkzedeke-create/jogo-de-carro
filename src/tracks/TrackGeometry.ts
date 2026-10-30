/**
 * Geração de "fitas" (ribbons) ao longo da pista, compartilhada entre os colisores físicos e as malhas
 * visuais — garantindo que o que o jogador vê é exatamente onde as rodas tocam.
 */
import type { CurbRange } from './TrackConfig';
import type { Track } from './Track';

export interface RibbonOptions {
  /** Deslocamento lateral inicial (m, + direita). Deve ser menor que `to`. */
  from: number;
  /** Deslocamento lateral final (m). */
  to: number;
  /** Altura relativa à superfície da linha central na borda `from`. */
  yFrom?: number;
  /** Altura relativa na borda `to`. */
  yTo?: number;
  /** Subdivisões transversais. */
  across?: number;
  /** Passo em amostras ao longo da pista (amostras de ~1 m). */
  step?: number;
  /** Restringe a fita a estes intervalos de `s` (ex.: zebras). */
  include?: readonly CurbRange[];
  /** Exclui estes intervalos de `s`. */
  exclude?: readonly CurbRange[];
  /** Comprimento (m) de uma repetição de textura ao longo da pista. */
  uvLength?: number;
  /** Limita o deslocamento no lado interno das curvas para evitar dobras. */
  clampInner?: boolean;
}

export interface RibbonGeometry {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  /** Distância `s` de cada vértice (útil para efeitos). */
  vertexS: Float32Array;
}

function inRanges(s: number, ranges: readonly CurbRange[], closed: boolean): boolean {
  for (const r of ranges) {
    if (r.startS <= r.endS) {
      if (s >= r.startS && s <= r.endS) return true;
    } else if (closed && (s >= r.startS || s <= r.endS)) {
      return true;
    }
  }
  return false;
}

/** Curvatura suavizada em janela larga (para limitar o lado interno). */
function smoothedCurvature(track: Track, i: number, window: number): number {
  const S = track.samples;
  const n = S.count;
  let maxAbs = 0;
  let signed = 0;
  for (let k = -window; k <= window; k++) {
    let j = i + k;
    if (track.closed) j = ((j % n) + n) % n;
    else if (j < 0 || j >= n) continue;
    const c = S.curvature[j];
    if (Math.abs(c) > maxAbs) {
      maxAbs = Math.abs(c);
      signed = c;
    }
  }
  return signed;
}

export function buildRibbon(track: Track, options: RibbonOptions): RibbonGeometry {
  const S = track.samples;
  const n = S.count;
  const step = Math.max(1, options.step ?? 2);
  const across = Math.max(1, options.across ?? 1);
  const yFrom = options.yFrom ?? 0;
  const yTo = options.yTo ?? yFrom;
  const uvLength = options.uvLength ?? 10;

  // Seleciona os índices das amostras e quebra em tiras contínuas.
  const strips: number[][] = [];
  let current: number[] = [];
  const indicesAlong: number[] = [];
  for (let i = 0; i < n; i += step) indicesAlong.push(i);
  if (!track.closed && indicesAlong[indicesAlong.length - 1] !== n - 1) indicesAlong.push(n - 1);

  const accept = (i: number) => {
    const s = S.s[i];
    if (options.include && !inRanges(s, options.include, track.closed)) return false;
    if (options.exclude && inRanges(s, options.exclude, track.closed)) return false;
    return true;
  };

  for (const i of indicesAlong) {
    if (accept(i)) {
      current.push(i);
    } else if (current.length) {
      strips.push(current);
      current = [];
    }
  }
  if (current.length) strips.push(current);

  // Em circuitos, une a última tira com a primeira se forem contínuas ao redor da largada.
  if (track.closed && strips.length > 0) {
    const first = strips[0];
    const last = strips[strips.length - 1];
    const wraps = first[0] === 0 && last[last.length - 1] === indicesAlong[indicesAlong.length - 1];
    if (wraps && strips.length > 1) {
      strips[0] = [...last, ...first];
      strips.pop();
    } else if (wraps && strips.length === 1) {
      // Fita completa: fecha o laço.
      first.push(first[0]);
    }
  }

  const rows = across + 1;
  let vertexCount = 0;
  let indexCount = 0;
  for (const strip of strips) {
    if (strip.length < 2) continue;
    vertexCount += strip.length * rows;
    indexCount += (strip.length - 1) * across * 6;
  }
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const vertexS = new Float32Array(vertexCount);
  const indices = new Uint32Array(indexCount);

  let v = 0;
  let idx = 0;
  for (const strip of strips) {
    if (strip.length < 2) continue;
    const base = v;
    let sAccum = 0;
    for (let k = 0; k < strip.length; k++) {
      const i = strip[k];
      if (k > 0) {
        const p = strip[k - 1];
        sAccum += Math.hypot(S.px[i] - S.px[p], S.pz[i] - S.pz[p]);
      }
      let from = options.from;
      let to = options.to;
      if (options.clampInner) {
        const kappa = smoothedCurvature(track, i, 8);
        if (Math.abs(kappa) > 1e-4) {
          const radius = 1 / Math.abs(kappa);
          const limit = radius * 0.97;
          // Curva à esquerda (kappa > 0): lado interno é o esquerdo (lateral negativa).
          if (kappa > 0) {
            from = Math.max(from, -limit);
            to = Math.max(to, -limit);
          } else {
            from = Math.min(from, limit);
            to = Math.min(to, limit);
          }
        }
      }
      for (let a = 0; a <= across; a++) {
        const f = a / across;
        const lateral = from + (to - from) * f;
        const y = yFrom + (yTo - yFrom) * f;
        positions[v * 3] = S.px[i] + S.rx[i] * lateral + S.ux[i] * y;
        positions[v * 3 + 1] = S.py[i] + S.ry[i] * lateral + S.uy[i] * y;
        positions[v * 3 + 2] = S.pz[i] + S.rz[i] * lateral + S.uz[i] * y;
        uvs[v * 2] = f;
        // Coordenada V contínua ao longo da tira (inclusive ao cruzar a largada em circuitos).
        uvs[v * 2 + 1] = (S.s[strip[0]] + sAccum) / uvLength;
        vertexS[v] = S.s[i];
        v++;
      }
    }
    for (let k = 0; k < strip.length - 1; k++) {
      for (let a = 0; a < across; a++) {
        const i0 = base + k * rows + a;
        const i1 = i0 + 1;
        const i2 = i0 + rows;
        const i3 = i2 + 1;
        // Ordem anti-horária vista de cima (normal para +Y) com "direita" = tangente × cima.
        indices[idx++] = i0;
        indices[idx++] = i1;
        indices[idx++] = i2;
        indices[idx++] = i1;
        indices[idx++] = i3;
        indices[idx++] = i2;
      }
    }
  }
  return { positions, uvs, indices, vertexS };
}
