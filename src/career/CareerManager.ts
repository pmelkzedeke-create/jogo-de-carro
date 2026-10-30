/**
 * Regras de economia e progresso aplicadas ao save (funções puras: retornam um novo SaveData).
 * - Recompensas são aplicadas UMA ÚNICA VEZ por resultado válido (identificador único por sessão).
 * - Compras validam saldo, desbloqueio e posse.
 */
import type { RaceResults } from '../racing/RaceTypes';
import type { RaceHistoryEntry, SaveData, TrackRecord } from '../persistence/SaveSchema';
import { findVehicle } from '../vehicles/VehicleCatalog';
import { levelFromXp } from './Progression';

export interface ApplyOutcome {
  save: SaveData;
  applied: boolean;
  levelUp: number | null;
  newRecord: boolean;
  unlockedAchievements: string[];
}

function cloneSave(save: SaveData): SaveData {
  return structuredClone(save);
}

export function applyRaceResults(save: SaveData, results: RaceResults, evaluateAchievements?: (save: SaveData, results: RaceResults) => string[]): ApplyOutcome {
  if (save.rewardedResults.includes(results.resultId)) {
    return { save, applied: false, levelUp: null, newRecord: false, unlockedAchievements: [] };
  }
  const next = cloneSave(save);
  const player = results.player;
  const config = results.config;
  const oldLevel = levelFromXp(next.profile.xp);

  // Estatísticas (contam mesmo sem recompensas, ex.: treino).
  next.stats.racesStarted += 1;
  next.stats.distanceKm += results.distance / 1000;
  next.stats.timeDrivingSec += results.durationSeconds;
  next.stats.collisions += results.collisions;
  next.stats.driftPoints += Math.round(results.driftScore);
  next.stats.bestDriftChain = Math.max(next.stats.bestDriftChain, Math.round(results.bestDriftChain));
  next.stats.topSpeedKmh = Math.max(next.stats.topSpeedKmh, results.topSpeed * 3.6);
  if (player.finished) next.stats.racesFinished += 1;
  const competitive = results.results.length > 1;
  if (competitive && player.finished && player.position === 1) next.stats.wins += 1;
  if (competitive && player.finished && player.position <= 3) next.stats.podiums += 1;

  // Recordes por pista.
  let newRecord = false;
  const record: TrackRecord = next.records[config.trackId] ?? { bestLap: null, bestLapVehicle: null, bestRace: null, bestDrift: null };
  if (player.bestLap !== null && (record.bestLap === null || player.bestLap < record.bestLap)) {
    record.bestLap = player.bestLap;
    record.bestLapVehicle = player.vehicleId;
    newRecord = true;
  }
  if (player.finished && player.totalTime !== null && config.mode !== 'practice' && config.mode !== 'drift' && (record.bestRace === null || player.totalTime < record.bestRace)) {
    record.bestRace = player.totalTime;
  }
  if (config.mode === 'drift' && results.driftScore > 0 && (record.bestDrift === null || results.driftScore > record.bestDrift)) {
    record.bestDrift = Math.round(results.driftScore);
  }
  next.records[config.trackId] = record;

  // Recompensas (somente resultados válidos).
  if (results.valid) {
    next.profile.credits += results.rewards.credits;
    next.profile.xp += results.rewards.xp;
    next.profile.reputation += results.rewards.reputation;
  }

  const entry: RaceHistoryEntry = {
    id: results.resultId,
    date: new Date().toISOString(),
    mode: config.mode,
    trackId: config.trackId,
    vehicleId: player.vehicleId,
    position: player.position,
    racers: results.results.length,
    totalTime: player.totalTime,
    bestLap: player.bestLap,
    credits: results.valid ? results.rewards.credits : 0,
    xp: results.valid ? results.rewards.xp : 0,
  };
  next.history = [entry, ...next.history].slice(0, 50);
  next.rewardedResults = [...next.rewardedResults, results.resultId].slice(-400);

  const unlockedAchievements = evaluateAchievements ? evaluateAchievements(next, results) : [];
  const now = new Date().toISOString();
  for (const id of unlockedAchievements) next.achievements[id] = now;

  const newLevel = levelFromXp(next.profile.xp);
  return { save: next, applied: true, levelUp: newLevel > oldLevel ? newLevel : null, newRecord, unlockedAchievements };
}

export type PurchaseError = 'unknown' | 'owned' | 'locked' | 'funds';

export function canBuyVehicle(save: SaveData, vehicleId: string): PurchaseError | null {
  const vehicle = findVehicle(vehicleId);
  if (!vehicle) return 'unknown';
  if (save.garage.owned.some((o) => o.id === vehicleId)) return 'owned';
  if (!isVehicleUnlocked(save, vehicleId)) return 'locked';
  if (save.profile.credits < vehicle.price) return 'funds';
  return null;
}

export function isVehicleUnlocked(save: SaveData, vehicleId: string): boolean {
  const vehicle = findVehicle(vehicleId);
  if (!vehicle) return false;
  if (vehicle.unlock.starter) return true;
  const level = levelFromXp(save.profile.xp);
  if (vehicle.unlock.level && level < vehicle.unlock.level) return false;
  if (vehicle.unlock.chapter && !save.career.completedChapters.includes(vehicle.unlock.chapter)) return false;
  return true;
}

export function buyVehicle(save: SaveData, vehicleId: string): { save: SaveData; error: PurchaseError | null } {
  const error = canBuyVehicle(save, vehicleId);
  if (error) return { save, error };
  const vehicle = findVehicle(vehicleId)!;
  const next = cloneSave(save);
  next.profile.credits -= vehicle.price;
  next.garage.owned.push({ id: vehicleId, paint: vehicle.visual.defaultPaint, ownedPaints: [vehicle.visual.defaultPaint] });
  next.garage.selected = vehicleId;
  return { save: next, error: null };
}

export function buyPaint(save: SaveData, vehicleId: string, paintId: string): { save: SaveData; error: PurchaseError | null } {
  const vehicle = findVehicle(vehicleId);
  const owned = save.garage.owned.find((o) => o.id === vehicleId);
  if (!vehicle || !owned) return { save, error: 'unknown' };
  const paint = vehicle.visual.paints.find((p) => p.id === paintId);
  if (!paint) return { save, error: 'unknown' };
  const next = cloneSave(save);
  const target = next.garage.owned.find((o) => o.id === vehicleId)!;
  if (!target.ownedPaints.includes(paintId)) {
    if (next.profile.credits < paint.price) return { save, error: 'funds' };
    next.profile.credits -= paint.price;
    target.ownedPaints.push(paintId);
  }
  target.paint = paintId;
  return { save: next, error: null };
}

export function selectVehicle(save: SaveData, vehicleId: string): SaveData {
  if (!save.garage.owned.some((o) => o.id === vehicleId)) return save;
  return { ...save, garage: { ...save.garage, selected: vehicleId } };
}

export function ownedPaintOf(save: SaveData, vehicleId: string): string | undefined {
  return save.garage.owned.find((o) => o.id === vehicleId)?.paint;
}
