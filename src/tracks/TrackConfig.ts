/**
 * Definição declarativa de pistas.
 * Uma pista é descrita por pontos de controle; o TrackBuilder gera a geometria contínua
 * (Catmull-Rom centrípeta), largura constante, checkpoints, grid, barreiras e áreas de escape.
 */
import type { Vector3 } from 'three';

export type TrackType = 'circuit' | 'sprint';
export type EnvironmentPresetId = 'day' | 'morning' | 'sunset' | 'overcast';
export type SceneryTheme = 'coastal' | 'forest' | 'industrial';
export type BarrierStyle = 'guardrail' | 'concrete';

/** [x, z, elevação opcional] em metros. */
export type ControlPoint = [number, number] | [number, number, number];

export interface ConePlacement {
  /** Fração da distância de corrida (0..1) a partir da largada. */
  at: number;
  /** Deslocamento lateral em metros (+ direita). */
  lateral: number;
}

export interface TrackDefinition {
  id: string;
  name: string;
  location: string;
  description: string;
  type: TrackType;
  controlPoints: ControlPoint[];
  /** Inverte o sentido de corrida em relação à ordem dos pontos. */
  reverse?: boolean;
  /** Largura do asfalto (m). */
  width: number;
  /** Faixa pavimentada/zebra além do asfalto (m, por lado). */
  shoulderWidth: number;
  /** Área de escape (grama) até a barreira (m, por lado). */
  runoffWidth: number;
  /** Posição da linha de largada como fração do comprimento da spline. */
  startPosition: number;
  /** Número de portais incluindo a linha de largada/chegada (circuito) ou largada e chegada (sprint). */
  checkpointCount: number;
  defaultLaps: number;
  gridSlots: number;
  /** Distância entre filas do grid (m). */
  gridSpacing: number;
  environment: EnvironmentPresetId;
  scenery: {
    theme: SceneryTheme;
    /** Árvores por hectare fora da pista. */
    treeDensity: number;
    /** Arquibancadas em frações da distância de corrida. */
    grandstands: number[];
    /** Lado do mar para o tema costeiro (+1 direita do mapa / -1 esquerda), se houver. */
    seaDirection?: [number, number];
  };
  barrierStyle: BarrierStyle;
  cones: ConePlacement[];
  /** Dificuldade percebida (1..5) apenas para exibição. */
  difficulty: number;
}

export interface Gate {
  index: number;
  /** Distância ao longo da spline. */
  s: number;
  /** Distância de corrida a partir da linha de largada. */
  raceDistance: number;
  position: Vector3;
  /** Normal do plano = sentido válido de cruzamento. */
  normal: Vector3;
  right: Vector3;
  up: Vector3;
  halfWidth: number;
  height: number;
  isStart: boolean;
  isFinish: boolean;
}

export interface GridSlot {
  index: number;
  position: Vector3;
  forward: Vector3;
  s: number;
  lateral: number;
}

export interface BarrierRun {
  /** -1 = esquerda, 1 = direita, 0 = barreira transversal (fim de pista em sprints). */
  side: -1 | 0 | 1;
  /** Pontos da face interna da barreira (no nível do solo). */
  points: Vector3[];
  /** Distâncias da spline correspondentes a cada ponto. */
  s: number[];
  closedLoop: boolean;
}

export interface CurbRange {
  startS: number;
  endS: number;
}

export interface TrackBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}
