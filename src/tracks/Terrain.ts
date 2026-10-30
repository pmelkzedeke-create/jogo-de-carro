/**
 * Terreno em grade (dados puros, sem renderização), usado tanto pela malha visual quanto pelo colisor.
 * - Próximo da pista, o terreno acompanha a elevação da pista (ligeiramente abaixo das fitas).
 * - Longe da pista, mistura-se suavemente com relevo natural (ruído fractal) conforme o tema.
 * A distância até a pista é obtida por propagação de vizinho mais próximo (transformada de distância
 * em duas passadas), evitando buscas caras por vértice.
 */
import { smoothstep } from '../utils/math';
import { hashString, ValueNoise2D } from '../utils/rng';
import type { Track } from './Track';

export interface TerrainData {
  originX: number;
  originZ: number;
  cellSize: number;
  cols: number;
  rows: number;
  /** Alturas (rows+1) x (cols+1), ordem linha-maior (z, depois x). */
  heights: Float32Array;
  /** Distância horizontal de cada vértice até a linha central. */
  trackDistance: Float32Array;
  /** Altura base do horizonte (bordas). */
  horizonHeight: number;
  /** Nível do mar (tema costeiro) ou -Infinity. */
  seaLevel: number;
}

export interface TerrainOptions {
  margin?: number;
  cellSize?: number;
}

export function buildTerrain(track: Track, options: TerrainOptions = {}): TerrainData {
  const margin = options.margin ?? 260;
  const cellSize = options.cellSize ?? 5;
  const b = track.bounds;
  const originX = Math.floor((b.minX - margin) / cellSize) * cellSize;
  const originZ = Math.floor((b.minZ - margin) / cellSize) * cellSize;
  const cols = Math.ceil((b.maxX + margin - originX) / cellSize);
  const rows = Math.ceil((b.maxZ + margin - originZ) / cellSize);
  const vx = cols + 1;
  const vz = rows + 1;
  const count = vx * vz;

  // --- Transformada de distância: semente = amostra mais próxima por vértice ---
  const S = track.samples;
  const nearest = new Int32Array(count).fill(-1);
  const dist2 = new Float32Array(count).fill(Infinity);
  const d2To = (vi: number, si: number) => {
    const x = originX + (vi % vx) * cellSize;
    const z = originZ + Math.floor(vi / vx) * cellSize;
    const dx = S.px[si] - x;
    const dz = S.pz[si] - z;
    return dx * dx + dz * dz;
  };
  for (let i = 0; i < S.count; i++) {
    const cx = Math.round((S.px[i] - originX) / cellSize);
    const cz = Math.round((S.pz[i] - originZ) / cellSize);
    if (cx < 0 || cz < 0 || cx >= vx || cz >= vz) continue;
    const vi = cz * vx + cx;
    const d = d2To(vi, i);
    if (d < dist2[vi]) {
      dist2[vi] = d;
      nearest[vi] = i;
    }
  }
  const relax = (vi: number, ni: number) => {
    const seed = nearest[ni];
    if (seed < 0) return;
    const d = d2To(vi, seed);
    if (d < dist2[vi]) {
      dist2[vi] = d;
      nearest[vi] = seed;
    }
  };
  for (let pass = 0; pass < 2; pass++) {
    for (let z = 0; z < vz; z++) {
      for (let x = 0; x < vx; x++) {
        const vi = z * vx + x;
        if (x > 0) relax(vi, vi - 1);
        if (z > 0) {
          relax(vi, vi - vx);
          if (x > 0) relax(vi, vi - vx - 1);
          if (x < vx - 1) relax(vi, vi - vx + 1);
        }
      }
    }
    for (let z = vz - 1; z >= 0; z--) {
      for (let x = vx - 1; x >= 0; x--) {
        const vi = z * vx + x;
        if (x < vx - 1) relax(vi, vi + 1);
        if (z < vz - 1) {
          relax(vi, vi + vx);
          if (x < vx - 1) relax(vi, vi + vx + 1);
          if (x > 0) relax(vi, vi + vx - 1);
        }
      }
    }
  }

  // --- Alturas ---
  const theme = track.definition.scenery.theme;
  const noise = new ValueNoise2D(hashString(track.id));
  const heights = new Float32Array(count);
  const trackDistance = new Float32Array(count);
  const band = track.barrierOffset + 6;
  const blend = theme === 'industrial' ? 40 : 90;
  const amplitude = theme === 'forest' ? 34 : theme === 'coastal' ? 16 : 3;
  const meanTrackY = (track.bounds.minY + track.bounds.maxY) / 2;
  const horizonHeight = meanTrackY + (theme === 'forest' ? 6 : 0);
  const seaDir = track.definition.scenery.seaDirection;
  const seaLevel = theme === 'coastal' && seaDir ? track.bounds.minY - 2.2 : -Infinity;
  const width = cols * cellSize;
  const depth = rows * cellSize;
  const borderFalloff = 70;

  for (let z = 0; z < vz; z++) {
    for (let x = 0; x < vx; x++) {
      const vi = z * vx + x;
      const wx = originX + x * cellSize;
      const wz = originZ + z * cellSize;
      const seed = nearest[vi];
      const d = Math.sqrt(dist2[vi]);
      trackDistance[vi] = d;
      const trackY = seed >= 0 ? S.py[seed] : meanTrackY;

      let natural = horizonHeight + (noise.fbm(wx / 380, wz / 380, 4) - 0.45) * 2 * amplitude;
      // Relevo cresce com a distância da pista (montanhas ao fundo, áreas planas perto).
      natural = trackY + (natural - trackY) * smoothstep(band, band + blend * 2.2, d);

      if (seaDir && Number.isFinite(seaLevel)) {
        // Distância assinada na direção do mar a partir da borda da pista.
        const along = (wx - (track.bounds.minX + track.bounds.maxX) / 2) * seaDir[0] + (wz - (track.bounds.minZ + track.bounds.maxZ) / 2) * seaDir[1];
        const extent = Math.abs(seaDir[0]) > 0.5 ? (track.bounds.maxX - track.bounds.minX) / 2 : (track.bounds.maxZ - track.bounds.minZ) / 2;
        const beyond = along - extent + 20;
        if (beyond > 0) natural = Math.min(natural, trackY - beyond * 0.09);
      }

      const t = smoothstep(band, band + blend, d);
      let h = trackY - 0.12 + (natural - (trackY - 0.12)) * t;

      // Bordas da grade convergem para a altura do horizonte (emenda com o plano distante).
      const edge = Math.min(wx - originX, originX + width - wx, wz - originZ, originZ + depth - wz);
      const e = smoothstep(0, borderFalloff, edge);
      h = horizonHeight - 0.6 + (h - (horizonHeight - 0.6)) * e;
      heights[vi] = h;
    }
  }

  return { originX, originZ, cellSize, cols, rows, heights, trackDistance, horizonHeight, seaLevel };
}

/** Altura interpolada (bilinear) em um ponto do mundo. */
export function terrainHeightAt(terrain: TerrainData, x: number, z: number): number {
  const fx = (x - terrain.originX) / terrain.cellSize;
  const fz = (z - terrain.originZ) / terrain.cellSize;
  const ix = Math.min(terrain.cols - 1, Math.max(0, Math.floor(fx)));
  const iz = Math.min(terrain.rows - 1, Math.max(0, Math.floor(fz)));
  const tx = Math.min(1, Math.max(0, fx - ix));
  const tz = Math.min(1, Math.max(0, fz - iz));
  const vx = terrain.cols + 1;
  const h00 = terrain.heights[iz * vx + ix];
  const h10 = terrain.heights[iz * vx + ix + 1];
  const h01 = terrain.heights[(iz + 1) * vx + ix];
  const h11 = terrain.heights[(iz + 1) * vx + ix + 1];
  const a = h00 + (h10 - h00) * tx;
  const c = h01 + (h11 - h01) * tx;
  return a + (c - a) * tz;
}

/** Distância interpolada até a pista. */
export function terrainTrackDistanceAt(terrain: TerrainData, x: number, z: number): number {
  const ix = Math.round((x - terrain.originX) / terrain.cellSize);
  const iz = Math.round((z - terrain.originZ) / terrain.cellSize);
  if (ix < 0 || iz < 0 || ix > terrain.cols || iz > terrain.rows) return Infinity;
  return terrain.trackDistance[iz * (terrain.cols + 1) + ix];
}

/** Índices de triângulos da grade (compartilhado entre física e renderização). */
export function terrainIndices(terrain: TerrainData): Uint32Array {
  const vx = terrain.cols + 1;
  const indices = new Uint32Array(terrain.cols * terrain.rows * 6);
  let k = 0;
  for (let z = 0; z < terrain.rows; z++) {
    for (let x = 0; x < terrain.cols; x++) {
      const a = z * vx + x;
      const b = a + 1;
      const c = a + vx;
      const d = c + 1;
      // Normais para cima (+Y): (a, c, b) e (b, c, d) com x→direita e z→"para baixo" no mapa.
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }
  return indices;
}

/** Posições (x, y, z) dos vértices da grade. */
export function terrainPositions(terrain: TerrainData): Float32Array {
  const vx = terrain.cols + 1;
  const vz = terrain.rows + 1;
  const positions = new Float32Array(vx * vz * 3);
  for (let z = 0; z < vz; z++) {
    for (let x = 0; x < vx; x++) {
      const vi = z * vx + x;
      positions[vi * 3] = terrain.originX + x * terrain.cellSize;
      positions[vi * 3 + 1] = terrain.heights[vi];
      positions[vi * 3 + 2] = terrain.originZ + z * terrain.cellSize;
    }
  }
  return positions;
}
