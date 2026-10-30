/**
 * Classificação em tempo real.
 * A posição é calculada por: concluídos (ordem de chegada) > portais válidos cruzados > distância real
 * percorrida desde o último portal válido. A distância é limitada ao trecho entre o último portal e o
 * próximo, de modo que atalhos ou recuos não "teleportam" ninguém na classificação.
 */
import { clamp, wrappedDelta } from '../utils/math';
import type { LapCounter } from './LapCounter';

export interface ProgressContext {
  closed: boolean;
  raceLength: number;
  /** Distância de corrida de cada portal (ordenada, portal 0 = 0). */
  gateDistances: readonly number[];
}

/**
 * Distância total percorrida na corrida (m), contínua e monotônica enquanto o carro avança corretamente.
 * @param trackDistance distância de corrida do carro na pista (0..raceLength)
 */
export function computeRaceProgress(lap: LapCounter, trackDistance: number, ctx: ProgressContext): number {
  const n = ctx.gateDistances.length;
  const L = ctx.raceLength;
  if (lap.progress === 0) {
    // Ainda não cruzou a largada (está no grid): progresso negativo = distância até a linha.
    if (!ctx.closed) return clamp(trackDistance, -500, 0);
    const behind = wrappedDelta(0, trackDistance, L);
    return clamp(behind, -500, 0);
  }

  if (!ctx.closed) {
    const last = Math.min(lap.progress - 1, n - 1);
    const next = Math.min(lap.progress, n - 1);
    const from = ctx.gateDistances[last];
    const to = lap.finished ? from : ctx.gateDistances[next];
    return clamp(trackDistance, from - 5, to + 5);
  }

  const lastGate = (lap.progress - 1) % n;
  const nextGate = lap.progress % n;
  const laps = Math.floor((lap.progress - 1) / n);
  const from = ctx.gateDistances[lastGate];
  const to = nextGate === 0 ? L : ctx.gateDistances[nextGate];
  const segment = to - from;
  const offset = clamp(wrappedDelta(from, trackDistance, L), -5, segment + 5);
  return laps * L + from + offset;
}

export interface RankEntry {
  id: string;
  finished: boolean;
  finishTime: number | null;
  dnf: boolean;
  progress: number;
  /** Tempo do último portal válido (desempate). */
  lastCrossingTime: number;
}

/** Ordena corredores: chegada (por tempo) > em corrida (por progresso) > abandonos. */
export function rankEntries<T extends RankEntry>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished && b.finished) return (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity);
    if (a.dnf !== b.dnf) return a.dnf ? 1 : -1;
    if (Math.abs(a.progress - b.progress) > 1e-3) return b.progress - a.progress;
    return a.lastCrossingTime - b.lastCrossingTime;
  });
}
