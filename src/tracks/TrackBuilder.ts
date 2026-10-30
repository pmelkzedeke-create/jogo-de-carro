/**
 * Constrói os dados de uma pista a partir de sua definição (sem renderização).
 * - Spline Catmull-Rom centrípeta (evita laços e cúspides).
 * - Amostragem uniforme por comprimento de arco (~1 m).
 * - Referenciais sem torção (direita = tangente × cima), largura constante.
 * - Curvatura com sinal, zebras automáticas nas curvas.
 * - Portais (checkpoints) orientados, grid de largada e linhas de barreira validadas.
 */
import { CatmullRomCurve3, Vector3 } from 'three';
import { wrap, wrappedDelta } from '../utils/math';
import { Track, type TrackSampleArrays } from './Track';
import type { BarrierRun, CurbRange, Gate, GridSlot, TrackDefinition } from './TrackConfig';

const SAMPLE_SPACING = 1.0;
const WORLD_UP = new Vector3(0, 1, 0);

export class TrackValidationError extends Error {}

function validateDefinition(def: TrackDefinition): void {
  if (def.controlPoints.length < 4) throw new TrackValidationError(`Pista ${def.id}: são necessários pelo menos 4 pontos de controle.`);
  if (!(def.width > 4)) throw new TrackValidationError(`Pista ${def.id}: largura inválida.`);
  if (def.checkpointCount < 3) throw new TrackValidationError(`Pista ${def.id}: são necessários pelo menos 3 portais.`);
  if (def.startPosition < 0 || def.startPosition >= 1) throw new TrackValidationError(`Pista ${def.id}: posição de largada fora de [0, 1).`);
}

export function buildTrack(def: TrackDefinition): Track {
  validateDefinition(def);
  const closed = def.type === 'circuit';
  const pts = def.controlPoints.map(([x, z, y]) => new Vector3(x, y ?? 0, z));
  if (def.reverse) pts.reverse();

  const curve = new CatmullRomCurve3(pts, closed, 'centripetal', 0.5);
  curve.arcLengthDivisions = 400;
  const approxLength = curve.getLength();
  curve.arcLengthDivisions = Math.max(1000, Math.ceil(approxLength / 0.2));
  curve.updateArcLengths();
  const splineLength = curve.getLength();

  const count = closed ? Math.round(splineLength / SAMPLE_SPACING) : Math.round(splineLength / SAMPLE_SPACING) + 1;
  const S: TrackSampleArrays = {
    count,
    px: new Float32Array(count),
    py: new Float32Array(count),
    pz: new Float32Array(count),
    tx: new Float32Array(count),
    ty: new Float32Array(count),
    tz: new Float32Array(count),
    rx: new Float32Array(count),
    ry: new Float32Array(count),
    rz: new Float32Array(count),
    ux: new Float32Array(count),
    uy: new Float32Array(count),
    uz: new Float32Array(count),
    curvature: new Float32Array(count),
    s: new Float32Array(count),
  };

  const p = new Vector3();
  const t = new Vector3();
  const r = new Vector3();
  const u = new Vector3();
  let cumulative = 0;
  const prev = new Vector3();
  for (let i = 0; i < count; i++) {
    const param = closed ? i / count : i / (count - 1);
    curve.getPointAt(param, p);
    curve.getTangentAt(param, t).normalize();
    if (i > 0) cumulative += p.distanceTo(prev);
    prev.copy(p);
    r.crossVectors(t, WORLD_UP);
    if (r.lengthSq() < 1e-8) r.set(-1, 0, 0);
    r.normalize();
    u.crossVectors(r, t).normalize();
    S.px[i] = p.x;
    S.py[i] = p.y;
    S.pz[i] = p.z;
    S.tx[i] = t.x;
    S.ty[i] = t.y;
    S.tz[i] = t.z;
    S.rx[i] = r.x;
    S.ry[i] = r.y;
    S.rz[i] = r.z;
    S.ux[i] = u.x;
    S.uy[i] = u.y;
    S.uz[i] = u.z;
    S.s[i] = cumulative;
  }
  const length = closed ? cumulative + Math.hypot(S.px[0] - S.px[count - 1], S.py[0] - S.py[count - 1], S.pz[0] - S.pz[count - 1]) : cumulative;

  // Curvatura horizontal com sinal (positiva = curva à esquerda), suavizada.
  const heading = new Float32Array(count);
  for (let i = 0; i < count; i++) heading[i] = Math.atan2(S.tx[i], S.tz[i]);
  const raw = new Float32Array(count);
  const span = 3;
  for (let i = 0; i < count; i++) {
    let a = i - span;
    let b = i + span;
    if (closed) {
      a = ((a % count) + count) % count;
      b = b % count;
    } else {
      a = Math.max(0, a);
      b = Math.min(count - 1, b);
    }
    let ds = S.s[b] - S.s[a];
    if (closed && ds <= 0) ds += length;
    raw[i] = ds > 0 ? wrappedDelta(heading[a], heading[b], Math.PI * 2) / ds : 0;
  }
  const smooth = 4;
  for (let i = 0; i < count; i++) {
    let sum = 0;
    let n = 0;
    for (let k = -smooth; k <= smooth; k++) {
      let j = i + k;
      if (closed) j = ((j % count) + count) % count;
      else if (j < 0 || j >= count) continue;
      sum += raw[j];
      n++;
    }
    S.curvature[i] = sum / n;
  }

  // Largada/chegada.
  let startS: number;
  let finishS: number;
  let raceLength: number;
  if (closed) {
    startS = wrap(def.startPosition * length, length);
    finishS = startS;
    raceLength = length;
  } else {
    const gridRoom = def.gridSpacing * Math.ceil(def.gridSlots / 2) + 20;
    startS = Math.max(def.startPosition * length, gridRoom);
    finishS = length - 60;
    raceLength = finishS - startS;
    if (raceLength < 300) throw new TrackValidationError(`Pista ${def.id}: trecho de sprint curto demais.`);
  }

  const track = new Track({ definition: def, closed, length, samples: S, startS, finishS, raceLength });
  track.gates = buildGates(track, def);
  track.grid = buildGrid(track, def);
  track.curbs = buildCurbs(track);
  track.barriers = buildBarriers(track);
  track.bounds = computeBounds(track);
  return track;
}

function buildGates(track: Track, def: TrackDefinition): Gate[] {
  const gates: Gate[] = [];
  const n = def.checkpointCount;
  const halfWidth = track.barrierOffset + 3;
  for (let i = 0; i < n; i++) {
    let raceDistance: number;
    if (track.closed) raceDistance = (i / n) * track.raceLength;
    else raceDistance = (i / (n - 1)) * track.raceLength;
    const s = track.sFromRaceDistance(raceDistance);
    const frame = track.sampleAt(s);
    gates.push({
      index: i,
      s,
      raceDistance,
      position: frame.position.clone(),
      normal: frame.tangent.clone(),
      right: frame.right.clone(),
      up: frame.up.clone(),
      halfWidth,
      height: 12,
      isStart: i === 0,
      isFinish: track.closed ? i === 0 : i === n - 1,
    });
  }
  return gates;
}

function buildGrid(track: Track, def: TrackDefinition): GridSlot[] {
  const slots: GridSlot[] = [];
  const lateralOffset = track.halfWidth * 0.42;
  for (let k = 0; k < def.gridSlots; k++) {
    const row = Math.floor(k / 2);
    const col = k % 2;
    const back = 9 + row * def.gridSpacing + col * (def.gridSpacing * 0.5);
    const s = track.wrapS(track.startS - back);
    const lateral = col === 0 ? -lateralOffset : lateralOffset;
    const frame = track.sampleAt(s);
    const position = frame.position.clone().addScaledVector(frame.right, lateral);
    slots.push({ index: k, position, forward: frame.tangent.clone(), s, lateral });
  }
  return slots;
}

function buildCurbs(track: Track): CurbRange[] {
  const S = track.samples;
  const threshold = 1 / 140;
  const ranges: CurbRange[] = [];
  let inRange = false;
  let start = 0;
  for (let i = 0; i < S.count; i++) {
    const curved = Math.abs(S.curvature[i]) > threshold;
    if (curved && !inRange) {
      inRange = true;
      start = S.s[i];
    } else if (!curved && inRange) {
      inRange = false;
      ranges.push({ startS: start, endS: S.s[i] });
    }
  }
  if (inRange) ranges.push({ startS: start, endS: track.length });

  // Une trechos próximos e estende um pouco antes/depois da curva.
  const extend = 10;
  const merged: CurbRange[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.startS - last.endS < 25) last.endS = range.endS;
    else merged.push({ ...range });
  }
  if (track.closed && merged.length > 1) {
    const first = merged[0];
    const last = merged[merged.length - 1];
    if (first.startS + track.length - last.endS < 25) {
      first.startS = last.startS;
      merged.pop();
    }
  }
  return merged.map((range) => ({
    startS: track.wrapS(range.startS - extend),
    endS: track.wrapS(range.endS + extend),
  }));
}

/** Gera linhas de barreira deslocadas e remove trechos que invadiriam a área de pilotagem. */
function buildBarriers(track: Track): BarrierRun[] {
  const S = track.samples;
  const offset = track.barrierOffset;
  const step = 3;
  const runs: BarrierRun[] = [];
  const minAllowed = offset - 0.6;

  for (const side of [-1, 1] as const) {
    const valid: boolean[] = [];
    const points: Vector3[] = [];
    const ss: number[] = [];
    for (let i = 0; i < S.count; i += step) {
      const point = new Vector3(S.px[i] + S.rx[i] * offset * side, S.py[i], S.pz[i] + S.rz[i] * offset * side);
      let minD = Infinity;
      track.spatial.forEachNear(point.x, point.z, offset + 4, (j) => {
        const dx = S.px[j] - point.x;
        const dz = S.pz[j] - point.z;
        const d = dx * dx + dz * dz;
        if (d < minD) minD = d;
      });
      valid.push(Math.sqrt(minD) >= minAllowed);
      points.push(point);
      ss.push(S.s[i]);
    }

    // Agrupa pontos válidos consecutivos em trechos contínuos.
    const total = points.length;
    const allValid = valid.every(Boolean);
    if (track.closed && allValid) {
      runs.push({ side, points, s: ss, closedLoop: true });
      continue;
    }
    // Para circuitos, começa a varredura em um ponto inválido para não partir um trecho no índice 0.
    let startIndex = 0;
    if (track.closed) {
      const firstInvalid = valid.indexOf(false);
      startIndex = firstInvalid >= 0 ? firstInvalid : 0;
    }
    let current: { points: Vector3[]; s: number[] } | null = null;
    for (let k = 0; k < total; k++) {
      const idx = track.closed ? (startIndex + k) % total : k;
      if (valid[idx]) {
        if (!current) current = { points: [], s: [] };
        current.points.push(points[idx]);
        current.s.push(ss[idx]);
      } else if (current) {
        if (current.points.length >= 2) runs.push({ side, points: current.points, s: current.s, closedLoop: false });
        current = null;
      }
    }
    if (current && current.points.length >= 2) runs.push({ side, points: current.points, s: current.s, closedLoop: false });
  }

  // Sprints: barreiras transversais fecham o início (atrás do grid) e o fim da estrada.
  if (!track.closed) {
    for (const s of [1.5, track.length - 1.5]) {
      const frame = track.sampleAt(s);
      const points: Vector3[] = [];
      const sList: number[] = [];
      const steps = 8;
      for (let k = 0; k <= steps; k++) {
        const lateral = -offset + (2 * offset * k) / steps;
        points.push(frame.position.clone().addScaledVector(frame.right, lateral));
        sList.push(s);
      }
      runs.push({ side: 0, points, s: sList, closedLoop: false });
    }
  }
  return runs;
}

function computeBounds(track: Track) {
  const S = track.samples;
  const margin = track.barrierOffset + 10;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < S.count; i++) {
    minX = Math.min(minX, S.px[i] - margin);
    maxX = Math.max(maxX, S.px[i] + margin);
    minZ = Math.min(minZ, S.pz[i] - margin);
    maxZ = Math.max(maxZ, S.pz[i] + margin);
    minY = Math.min(minY, S.py[i]);
    maxY = Math.max(maxY, S.py[i]);
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

/**
 * Verifica se trechos não adjacentes da pista ficam próximos demais (risco de atalhos ou sobreposição).
 * Retorna a menor separação encontrada entre trechos distantes ao longo da pista.
 */
export function minimumSectionSeparation(track: Track): number {
  const S = track.samples;
  const arcExclusion = track.barrierOffset * 4;
  let minSep = Infinity;
  for (let i = 0; i < S.count; i += 2) {
    track.spatial.forEachNear(S.px[i], S.pz[i], track.barrierOffset * 2 + 30, (j) => {
      let arc = Math.abs(S.s[i] - S.s[j]);
      if (track.closed) arc = Math.min(arc, track.length - arc);
      if (arc < arcExclusion) return;
      const d = Math.hypot(S.px[i] - S.px[j], S.pz[i] - S.pz[j]);
      if (d < minSep) minSep = d;
    });
  }
  return minSep;
}
