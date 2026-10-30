/**
 * Conquistas baseadas em dados reais do progresso e dos resultados.
 */
import type { RaceResults } from '../racing/RaceTypes';
import type { SaveData } from '../persistence/SaveSchema';
import { levelFromXp } from './Progression';

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  check: (save: SaveData, results: RaceResults | null) => boolean;
}

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  { id: 'first-finish', name: 'Bandeira quadriculada', description: 'Conclua sua primeira corrida.', check: (s) => s.stats.racesFinished >= 1 },
  { id: 'first-win', name: 'Primeira vitória', description: 'Vença uma corrida contra adversários.', check: (s) => s.stats.wins >= 1 },
  { id: 'podium-5', name: 'Frequentador do pódio', description: 'Termine 5 corridas no pódio.', check: (s) => s.stats.podiums >= 5 },
  { id: 'wins-10', name: 'Colecionador de troféus', description: 'Vença 10 corridas.', check: (s) => s.stats.wins >= 10 },
  {
    id: 'clean-win',
    name: 'Corrida limpa',
    description: 'Vença uma corrida sem colisões fortes.',
    check: (_s, r) => !!r && r.results.length > 1 && r.player.finished && r.player.position === 1 && r.collisions === 0,
  },
  {
    id: 'comeback',
    name: 'Do fundo do grid',
    description: 'Vença largando da última posição com pelo menos 5 adversários.',
    check: (_s, r) => !!r && r.results.length >= 6 && r.player.finished && r.player.position === 1,
  },
  { id: 'drift-10k', name: 'Fumaça nos pneus', description: 'Some 10.000 pontos de drift em uma única sessão.', check: (_s, r) => !!r && r.driftScore >= 10000 },
  { id: 'drift-chain-3k', name: 'Sequência perfeita', description: 'Faça uma única sequência de drift de 3.000 pontos.', check: (s) => s.stats.bestDriftChain >= 3000 },
  { id: 'distance-100', name: 'Estradeiro', description: 'Percorra 100 km no total.', check: (s) => s.stats.distanceKm >= 100 },
  { id: 'speed-250', name: 'Barreira dos 250', description: 'Atinja 250 km/h.', check: (s) => s.stats.topSpeedKmh >= 250 },
  { id: 'level-5', name: 'Em ascensão', description: 'Alcance o nível 5.', check: (s) => levelFromXp(s.profile.xp) >= 5 },
  { id: 'level-10', name: 'Veterano', description: 'Alcance o nível 10.', check: (s) => levelFromXp(s.profile.xp) >= 10 },
  { id: 'garage-3', name: 'Garagem cheia', description: 'Tenha 3 carros na garagem.', check: (s) => s.garage.owned.length >= 3 },
  { id: 'hard-win', name: 'Sem piedade', description: 'Vença uma corrida na dificuldade Difícil.', check: (_s, r) => !!r && r.config.difficulty === 'hard' && r.results.length > 1 && r.player.finished && r.player.position === 1 },
];

/** Retorna as conquistas recém-desbloqueadas (não presentes no save). */
export function evaluateAchievements(save: SaveData, results: RaceResults | null): string[] {
  const unlocked: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (save.achievements[a.id]) continue;
    if (a.check(save, results)) unlocked.push(a.id);
  }
  return unlocked;
}

export function achievementName(id: string): string {
  return ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id;
}
