/**
 * Monta a configuração de uma corrida a partir das escolhas do jogador.
 * Os adversários são escolhidos por índice de desempenho semelhante ao carro do jogador.
 */
import type { DifficultyId } from '../ai/Difficulty';
import type { SaveData } from '../persistence/SaveSchema';
import { MODES, type GameMode, type RaceConfig, type RacerEntry, type RaceObjective } from '../racing/RaceTypes';
import { getTrackDefinition } from '../tracks/TrackCatalog';
import { SeededRandom } from '../utils/rng';
import { assistLevelValue } from '../vehicles/VehicleController';
import { VEHICLES, getVehicle } from '../vehicles/VehicleCatalog';
import { estimatePerformance } from '../vehicles/VehiclePerformance';

export interface SetupState {
  mode: GameMode;
  trackId: string;
  vehicleId: string;
  laps: number;
  opponents: number;
  difficulty: DifficultyId;
}

/** Nomes fictícios de pilotos adversários. */
export const DRIVER_NAMES = [
  'Rafael Monteiro',
  'Lia Okada',
  'Bruno Cassiano',
  'Nara Vilela',
  'Diego Ferraz',
  'Helena Sato',
  'Igor Brandão',
  'Talita Reis',
  'Marco Azevedo',
  'Júlia Prado',
  'Otávio Lins',
  'Bianca Torres',
];

export const DRIFT_TIME_LIMIT = 150;

/**
 * Escolhe carros adversários com índice de desempenho compatível com o do jogador:
 * Fácil = iguais ou mais lentos; Normal = semelhantes; Difícil = semelhantes ou mais rápidos.
 */
export function pickOpponentVehicles(playerVehicleId: string, count: number, rng: SeededRandom, difficulty: DifficultyId = 'normal'): string[] {
  const playerIndex = estimatePerformance(getVehicle(playerVehicleId)).index;
  const window = difficulty === 'easy' ? { below: 160, above: 25 } : difficulty === 'normal' ? { below: 110, above: 90 } : { below: 60, above: 160 };
  const ranked = VEHICLES.map((v) => ({ id: v.id, delta: estimatePerformance(v).index - playerIndex })).sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
  const pool = ranked.filter((r) => r.delta >= -window.below && r.delta <= window.above).map((r) => r.id);
  const candidates = pool.length > 0 ? pool : [playerVehicleId];
  const result: string[] = [];
  for (let i = 0; i < count; i++) result.push(candidates[Math.floor(rng.next() * candidates.length)]);
  return result;
}

export function buildRaceConfig(setup: SetupState, save: SaveData, seed = Date.now() % 2147483647): RaceConfig {
  const mode = MODES[setup.mode];
  const track = getTrackDefinition(setup.trackId);
  const rng = new SeededRandom(seed);
  const vehicle = getVehicle(setup.vehicleId);
  const owned = save.garage.owned.find((o) => o.id === setup.vehicleId);
  const player: RacerEntry = {
    id: 'player',
    name: save.profile.driverName,
    vehicleId: setup.vehicleId,
    paint: owned?.paint ?? vehicle.visual.defaultPaint,
  };
  const opponents: RacerEntry[] = [];
  if (mode.hasOpponents) {
    const count = Math.max(0, Math.min(setup.opponents, track.gridSlots - 1));
    const vehicles = pickOpponentVehicles(setup.vehicleId, count, rng, setup.difficulty);
    const names = [...DRIVER_NAMES].sort(() => rng.next() - 0.5);
    for (let i = 0; i < count; i++) {
      const def = getVehicle(vehicles[i]);
      const paint = def.visual.paints[Math.floor(rng.next() * def.visual.paints.length)].id;
      opponents.push({ id: `ai-${i + 1}`, name: names[i % names.length], vehicleId: def.id, paint });
    }
  }
  const laps = track.type === 'sprint' ? 1 : Math.max(1, Math.min(10, setup.laps));
  const lengthFactor = (track.type === 'sprint' ? 1.4 : laps) * (track.difficulty / 3 + 0.5);
  const objectives: RaceObjective[] = [];
  if (mode.hasOpponents) objectives.push({ type: 'position', value: 3, label: 'Terminar no pódio (top 3)' });
  if (setup.mode === 'timeTrial') {
    const record = save.records[setup.trackId]?.bestLap ?? null;
    if (record) objectives.push({ type: 'bestLap', value: record, label: 'Superar seu recorde de volta' });
    else objectives.push({ type: 'finish', value: 1, label: 'Completar as voltas cronometradas' });
  }
  if (setup.mode === 'drift') objectives.push({ type: 'drift', value: 15000, label: 'Somar 15.000 pontos de drift' });
  return {
    mode: setup.mode,
    trackId: setup.trackId,
    laps: setup.mode === 'drift' ? 99 : laps,
    player,
    opponents,
    difficulty: setup.difficulty,
    seed,
    objectives,
    rewardBase: Math.round(1800 * lengthFactor),
    xpBase: Math.round(260 * lengthFactor),
    timeLimit: setup.mode === 'drift' ? DRIFT_TIME_LIMIT : undefined,
    assist: assistLevelValue(save.settings.controls.assist),
  };
}
