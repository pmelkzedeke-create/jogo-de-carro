/**
 * Campeonatos por pontos corridos, com grid fixo de pilotos (nomes e carros estáveis entre etapas).
 */
import type { DifficultyId } from '../ai/Difficulty';
import type { RaceResults, RacerEntry } from '../racing/RaceTypes';
import type { ChampionshipProgress, SaveData } from '../persistence/SaveSchema';

export const POINTS_TABLE = [25, 18, 15, 12, 10, 8, 6, 4];

export interface ChampionshipRound {
  trackId: string;
  laps: number;
}

export interface ChampionshipDefinition {
  id: string;
  name: string;
  description: string;
  difficulty: DifficultyId;
  rounds: ChampionshipRound[];
  field: RacerEntry[];
  unlockLevel: number;
  /** Disponível apenas pela carreira (não listado como campeonato livre). */
  careerOnly?: boolean;
  rewards: Array<{ credits: number; xp: number; reputation: number }>;
}

export const CHAMPIONSHIPS: readonly ChampionshipDefinition[] = [
  {
    id: 'copa-litoral',
    name: 'Copa Litoral',
    description: 'Três etapas entre a orla e o porto. Ideal para carros de rua e esportivos.',
    difficulty: 'normal',
    rounds: [
      { trackId: 'costa-azul', laps: 3 },
      { trackId: 'porto-industrial', laps: 3 },
      { trackId: 'serra-verde', laps: 2 },
    ],
    field: [
      { id: 'cl-1', name: 'Rafael Monteiro', vehicleId: 'kestrel-rs4', paint: 'titanium' },
      { id: 'cl-2', name: 'Nara Vilela', vehicleId: 'valkar-sprint-gt', paint: 'apex-red' },
      { id: 'cl-3', name: 'Diego Ferraz', vehicleId: 'sable-nero-v8', paint: 'solar' },
      { id: 'cl-4', name: 'Helena Sato', vehicleId: 'valkar-sprint-gt', paint: 'abyss' },
      { id: 'cl-5', name: 'Igor Brandão', vehicleId: 'kestrel-rs4', paint: 'glacier' },
    ],
    unlockLevel: 1,
    rewards: [
      { credits: 18000, xp: 1800, reputation: 90 },
      { credits: 11000, xp: 1200, reputation: 55 },
      { credits: 7000, xp: 800, reputation: 30 },
    ],
  },
  {
    id: 'trofeu-serra',
    name: 'Troféu da Serra',
    description: 'Serra, estrada e litoral contra os pilotos mais rápidos da região. Exige carros fortes.',
    difficulty: 'hard',
    rounds: [
      { trackId: 'serra-verde', laps: 3 },
      { trackId: 'estrada-mirante', laps: 1 },
      { trackId: 'costa-azul', laps: 4 },
    ],
    field: [
      { id: 'ts-1', name: 'Talita Reis', vehicleId: 'arcadia-volt-e', paint: 'quartz' },
      { id: 'ts-2', name: 'Marco Azevedo', vehicleId: 'sable-nero-v8', paint: 'onyx' },
      { id: 'ts-3', name: 'Júlia Prado', vehicleId: 'kestrel-rs4', paint: 'abyss' },
      { id: 'ts-4', name: 'Otávio Lins', vehicleId: 'arcadia-volt-e', paint: 'jade' },
      { id: 'ts-5', name: 'Bianca Torres', vehicleId: 'sable-nero-v8', paint: 'apex-red' },
      { id: 'ts-6', name: 'Lia Okada', vehicleId: 'sable-nero-v8', paint: 'jade', rival: true },
    ],
    unlockLevel: 4,
    rewards: [
      { credits: 32000, xp: 3000, reputation: 150 },
      { credits: 20000, xp: 2000, reputation: 90 },
      { credits: 12000, xp: 1300, reputation: 50 },
    ],
  },
  {
    id: 'regional-litoral',
    name: 'Campeonato Regional Litoral',
    description: 'O campeonato da carreira: três etapas contra Lia Okada, Caio Ventura e o pelotão regional.',
    difficulty: 'normal',
    careerOnly: true,
    rounds: [
      { trackId: 'costa-azul', laps: 3 },
      { trackId: 'porto-industrial', laps: 3 },
      { trackId: 'serra-verde', laps: 2 },
    ],
    field: [
      { id: 'rival-lia', name: 'Lia Okada', vehicleId: 'sable-nero-v8', paint: 'jade', rival: true },
      { id: 'rival-caio', name: 'Caio Ventura', vehicleId: 'kestrel-rs4', paint: 'onyx', rival: true },
      { id: 'rg-1', name: 'Bruno Cassiano', vehicleId: 'kestrel-rs4', paint: 'titanium' },
      { id: 'rg-2', name: 'Talita Reis', vehicleId: 'valkar-sprint-gt', paint: 'solar' },
      { id: 'rg-3', name: 'Marco Azevedo', vehicleId: 'sable-nero-v8', paint: 'abyss' },
    ],
    unlockLevel: 1,
    rewards: [
      { credits: 12000, xp: 1200, reputation: 60 },
      { credits: 8000, xp: 900, reputation: 40 },
      { credits: 5000, xp: 600, reputation: 25 },
    ],
  },
];

export function getChampionship(id: string): ChampionshipDefinition {
  const c = CHAMPIONSHIPS.find((x) => x.id === id);
  if (!c) throw new Error(`Campeonato desconhecido: ${id}`);
  return c;
}

export function emptyProgress(): ChampionshipProgress {
  return { round: 0, points: {}, completed: false, finalPosition: null, lastResultId: null };
}

export interface StandingEntry {
  id: string;
  name: string;
  points: number;
  isPlayer: boolean;
  rival: boolean;
}

export function standings(def: ChampionshipDefinition, progress: ChampionshipProgress, playerName: string): StandingEntry[] {
  const entries: StandingEntry[] = [
    { id: 'player', name: playerName, points: progress.points.player ?? 0, isPlayer: true, rival: false },
    ...def.field.map((f) => ({ id: f.id, name: f.name, points: progress.points[f.id] ?? 0, isPlayer: false, rival: !!f.rival })),
  ];
  // Desempate: mais pontos; depois, jogador por último (regra simples e estável).
  return entries.sort((a, b) => b.points - a.points || (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0));
}

export interface ChampionshipUpdate {
  save: SaveData;
  applied: boolean;
  finished: boolean;
  finalPosition: number | null;
  reward: { credits: number; xp: number; reputation: number } | null;
}

/**
 * Registra os pontos de uma etapa (uma única vez por resultado) e encerra o campeonato na última etapa.
 * Os pontos vêm das posições reais da corrida.
 */
export function applyChampionshipRound(save: SaveData, championshipId: string, results: RaceResults): ChampionshipUpdate {
  const def = getChampionship(championshipId);
  const current = save.championships[championshipId] ?? emptyProgress();
  if (current.completed || current.lastResultId === results.resultId) {
    return { save, applied: false, finished: current.completed, finalPosition: current.finalPosition, reward: null };
  }
  const next = structuredClone(save);
  const progress: ChampionshipProgress = { ...current, points: { ...current.points } };
  for (const r of results.results) {
    const pts = r.finished ? (POINTS_TABLE[r.position - 1] ?? 0) : 0;
    progress.points[r.id] = (progress.points[r.id] ?? 0) + pts;
  }
  progress.round += 1;
  progress.lastResultId = results.resultId;
  let reward: ChampionshipUpdate['reward'] = null;
  if (progress.round >= def.rounds.length) {
    progress.completed = true;
    const table = standings(def, progress, save.profile.driverName);
    progress.finalPosition = table.findIndex((e) => e.isPlayer) + 1;
    reward = def.rewards[progress.finalPosition - 1] ?? null;
    if (reward) {
      next.profile.credits += reward.credits;
      next.profile.xp += reward.xp;
      next.profile.reputation += reward.reputation;
    }
  }
  next.championships[championshipId] = progress;
  return { save: next, applied: true, finished: progress.completed, finalPosition: progress.finalPosition, reward };
}

/** Inicia uma nova temporada (zera os pontos) — ação explícita do jogador. */
export function resetChampionship(save: SaveData, championshipId: string): SaveData {
  const next = structuredClone(save);
  next.championships[championshipId] = emptyProgress();
  return next;
}
