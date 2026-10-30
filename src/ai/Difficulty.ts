/**
 * Níveis de dificuldade da IA.
 * A dificuldade altera ritmo, uso de aderência, precisão de frenagem, frequência de erros e
 * agressividade — nunca "teleporta" ou dá aceleração impossível aos adversários (sem rubber band).
 */
export type DifficultyId = 'easy' | 'normal' | 'hard';

export interface AIDifficulty {
  id: DifficultyId;
  label: string;
  /** Fração da velocidade ideal nas curvas. */
  corneringFactor: number;
  /** Fração da velocidade máxima em retas. */
  straightFactor: number;
  /** Fração da desaceleração de frenagem utilizada no planejamento. */
  brakingFactor: number;
  /** Erros por minuto (em média). */
  mistakesPerMinute: number;
  /** Ruído lateral de trajetória (m). */
  lineNoise: number;
  /** Disposição para ultrapassar (0..1). */
  aggression: number;
  /** Multiplicador de recompensas. */
  rewardMultiplier: number;
}

export const DIFFICULTIES: Record<DifficultyId, AIDifficulty> = {
  easy: {
    id: 'easy',
    label: 'Fácil',
    corneringFactor: 0.84,
    straightFactor: 0.9,
    brakingFactor: 0.7,
    mistakesPerMinute: 1.6,
    lineNoise: 0.9,
    aggression: 0.25,
    rewardMultiplier: 0.8,
  },
  normal: {
    id: 'normal',
    label: 'Normal',
    corneringFactor: 0.92,
    straightFactor: 0.96,
    brakingFactor: 0.8,
    mistakesPerMinute: 0.8,
    lineNoise: 0.5,
    aggression: 0.55,
    rewardMultiplier: 1,
  },
  hard: {
    id: 'hard',
    label: 'Difícil',
    corneringFactor: 0.985,
    straightFactor: 1,
    brakingFactor: 0.88,
    mistakesPerMinute: 0.3,
    lineNoise: 0.25,
    aggression: 0.85,
    rewardMultiplier: 1.3,
  },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ['easy', 'normal', 'hard'];
