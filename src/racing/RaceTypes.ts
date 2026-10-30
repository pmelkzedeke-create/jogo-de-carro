/**
 * Tipos compartilhados das sessões de corrida.
 */
import type { DifficultyId } from '../ai/Difficulty';

export type GameMode = 'quickRace' | 'timeTrial' | 'practice' | 'drift' | 'career' | 'championship';

export interface ModeInfo {
  id: GameMode;
  label: string;
  description: string;
  hasOpponents: boolean;
  hasFinish: boolean;
  timing: 'green' | 'firstCrossing';
  rewards: boolean;
}

export const MODES: Readonly<Record<GameMode, ModeInfo>> = {
  quickRace: {
    id: 'quickRace',
    label: 'Corrida rápida',
    description: 'Escolha pista, carro, adversários e dificuldade e dispute uma corrida completa.',
    hasOpponents: true,
    hasFinish: true,
    timing: 'green',
    rewards: true,
  },
  timeTrial: {
    id: 'timeTrial',
    label: 'Contrarrelógio',
    description: 'Sozinho na pista contra o relógio. Bata seu recorde pessoal de volta.',
    hasOpponents: false,
    hasFinish: true,
    timing: 'firstCrossing',
    rewards: true,
  },
  practice: {
    id: 'practice',
    label: 'Treino livre',
    description: 'Pilote sem pressão, aprenda o traçado e acompanhe seus tempos de volta.',
    hasOpponents: false,
    hasFinish: false,
    timing: 'firstCrossing',
    rewards: false,
  },
  drift: {
    id: 'drift',
    label: 'Desafio de drift',
    description: 'Some pontos com drifts válidos e limpos. Batidas e saídas de pista zeram a sequência.',
    hasOpponents: false,
    hasFinish: true,
    timing: 'green',
    rewards: true,
  },
  career: {
    id: 'career',
    label: 'Carreira',
    description: 'Evento da carreira.',
    hasOpponents: true,
    hasFinish: true,
    timing: 'green',
    rewards: true,
  },
  championship: {
    id: 'championship',
    label: 'Campeonato',
    description: 'Etapa de campeonato.',
    hasOpponents: true,
    hasFinish: true,
    timing: 'green',
    rewards: true,
  },
};

export type ObjectiveType = 'position' | 'time' | 'drift' | 'finish' | 'bestLap';

export interface RaceObjective {
  type: ObjectiveType;
  value: number;
  label: string;
}

export interface RacerEntry {
  id: string;
  name: string;
  vehicleId: string;
  paint: string;
  /** Indica um rival da história (destaque visual). */
  rival?: boolean;
}

export interface RaceConfig {
  mode: GameMode;
  trackId: string;
  laps: number;
  player: RacerEntry;
  opponents: RacerEntry[];
  difficulty: DifficultyId;
  seed: number;
  eventId?: string;
  eventName?: string;
  objectives: RaceObjective[];
  /** Créditos base (vitória/conclusão). */
  rewardBase: number;
  xpBase: number;
  /** Limite de tempo (s) — usado no desafio de drift. */
  timeLimit?: number;
  /** Assistência do jogador (0..1). */
  assist: number;
}

export interface RacerResult {
  id: string;
  name: string;
  vehicleId: string;
  isPlayer: boolean;
  position: number;
  finished: boolean;
  dnf: boolean;
  totalTime: number | null;
  bestLap: number | null;
  lapTimes: number[];
  gapToLeader: number | null;
  /** Progresso (m) no momento do resultado (para não concluintes). */
  progress: number;
  driftScore: number;
  rival: boolean;
}

export interface ObjectiveResult {
  objective: RaceObjective;
  achieved: boolean;
}

export interface RaceRewards {
  credits: number;
  xp: number;
  reputation: number;
  breakdown: Array<{ label: string; credits: number; xp: number }>;
}

export interface RaceResults {
  resultId: string;
  config: RaceConfig;
  trackName: string;
  results: RacerResult[];
  player: RacerResult;
  objectives: ObjectiveResult[];
  rewards: RaceRewards;
  /** Indica que a corrida foi concluída de forma válida (base para recompensas). */
  valid: boolean;
  driftScore: number;
  bestDriftChain: number;
  collisions: number;
  distance: number;
  topSpeed: number;
  durationSeconds: number;
}
