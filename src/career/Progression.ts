/**
 * Progressão do piloto: níveis por experiência (XP) e reputação.
 */
export const MAX_LEVEL = 50;

/** XP total necessária para alcançar um nível (nível 1 = 0 XP). */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(450 * Math.pow(level - 1, 1.45));
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
  return level;
}

export interface LevelProgress {
  level: number;
  current: number;
  next: number;
  fraction: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelFromXp(xp);
  const current = xpForLevel(level);
  const next = level >= MAX_LEVEL ? current : xpForLevel(level + 1);
  const fraction = next > current ? (xp - current) / (next - current) : 1;
  return { level, current, next, fraction };
}

export function reputationTitle(reputation: number): string {
  if (reputation >= 1200) return 'Lenda das pistas';
  if (reputation >= 700) return 'Piloto de elite';
  if (reputation >= 350) return 'Nome conhecido';
  if (reputation >= 120) return 'Promessa regional';
  if (reputation >= 30) return 'Novato com potencial';
  return 'Desconhecido';
}
