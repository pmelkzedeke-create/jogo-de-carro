/**
 * Dados do HUD atualizados a cada quadro pelo jogo (objeto mutável, sem alocações).
 * A interface React lê estes valores por requestAnimationFrame e atualiza o DOM diretamente,
 * evitando recriar componentes a cada quadro.
 */
import type { GameMode } from '../racing/RaceTypes';
import type { RacePhase } from '../racing/RaceSession';

export interface HudData {
  active: boolean;
  mode: GameMode;
  phase: RacePhase;
  countdown: number;
  speed: number;
  rpm: number;
  redline: number;
  limiter: number;
  gear: string;
  shifting: boolean;
  lap: number;
  totalLaps: number;
  infiniteLaps: boolean;
  lapTime: number | null;
  lastLap: number | null;
  bestLap: number | null;
  personalBest: number | null;
  totalTime: number;
  position: number;
  racers: number;
  progress: number;
  wrongWay: boolean;
  missedCheckpoint: boolean;
  ghost: boolean;
  driftActive: boolean;
  driftChain: number;
  driftMultiplier: number;
  driftTotal: number;
  timeLeft: number | null;
  finished: boolean;
  /** Posições normalizadas (0..1) no minimapa: x0, y0, x1, y1... */
  minimap: Float32Array;
  minimapCount: number;
  playerIndex: number;
  /** Índices dos rivais no minimapa (destaque). */
  rivalMask: Uint8Array;
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  physicsMs: number;
}

export function createHudData(): HudData {
  return {
    active: false,
    mode: 'quickRace',
    phase: 'intro',
    countdown: 3,
    speed: 0,
    rpm: 0,
    redline: 7000,
    limiter: 7300,
    gear: 'N',
    shifting: false,
    lap: 1,
    totalLaps: 1,
    infiniteLaps: false,
    lapTime: null,
    lastLap: null,
    bestLap: null,
    personalBest: null,
    totalTime: 0,
    position: 1,
    racers: 1,
    progress: 0,
    wrongWay: false,
    missedCheckpoint: false,
    ghost: false,
    driftActive: false,
    driftChain: 0,
    driftMultiplier: 1,
    driftTotal: 0,
    timeLeft: null,
    finished: false,
    minimap: new Float32Array(16),
    minimapCount: 0,
    playerIndex: 0,
    rivalMask: new Uint8Array(8),
    fps: 0,
    frameMs: 0,
    drawCalls: 0,
    triangles: 0,
    physicsMs: 0,
  };
}
