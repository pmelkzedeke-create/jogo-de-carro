/**
 * Construção dos resultados e cálculo de recompensas a partir de dados REAIS da sessão.
 * A aplicação das recompensas ao perfil é idempotente (ver CareerManager): cada resultado tem um
 * identificador único e só é recompensado uma vez.
 */
import { DIFFICULTIES } from '../ai/Difficulty';
import type { RaceSession } from './RaceSession';
import { MODES, type ObjectiveResult, type RaceConfig, type RaceResults, type RaceRewards, type RacerResult } from './RaceTypes';

const POSITION_FACTORS = [1, 0.72, 0.55, 0.42, 0.32, 0.25, 0.2, 0.16];

export function evaluateObjectives(config: RaceConfig, player: RacerResult): ObjectiveResult[] {
  return config.objectives.map((objective) => {
    let achieved = false;
    switch (objective.type) {
      case 'position':
        achieved = player.finished && player.position <= objective.value;
        break;
      case 'finish':
        achieved = player.finished;
        break;
      case 'time':
        achieved = player.finished && player.totalTime !== null && player.totalTime <= objective.value;
        break;
      case 'bestLap':
        achieved = player.bestLap !== null && player.bestLap <= objective.value;
        break;
      case 'drift':
        achieved = player.driftScore >= objective.value;
        break;
    }
    return { objective, achieved };
  });
}

export function computeRewards(
  config: RaceConfig,
  player: RacerResult,
  objectives: ObjectiveResult[],
  options: { newRecord: boolean; racers: number; cleanRace: boolean },
): RaceRewards {
  const mode = MODES[config.mode];
  const breakdown: RaceRewards['breakdown'] = [];
  if (!mode.rewards || !player.finished) return { credits: 0, xp: 0, reputation: 0, breakdown };

  let credits = 0;
  let xp = 0;
  let reputation = 0;
  const diff = mode.hasOpponents ? DIFFICULTIES[config.difficulty].rewardMultiplier : 1;

  if (mode.hasOpponents) {
    const factor = POSITION_FACTORS[Math.min(player.position, POSITION_FACTORS.length) - 1] ?? 0.12;
    const fieldBonus = 0.7 + 0.3 * Math.min(1, (options.racers - 1) / 7);
    const c = Math.round(config.rewardBase * factor * diff * fieldBonus);
    const x = Math.round(config.xpBase * (0.45 + factor) * diff);
    credits += c;
    xp += x;
    breakdown.push({ label: `${player.position}º lugar`, credits: c, xp: x });
    reputation += player.position <= 3 ? (4 - player.position) * 12 : 3;
  } else if (config.mode === 'drift') {
    const c = Math.round(Math.min(config.rewardBase * 1.6, player.driftScore * 0.5));
    const x = Math.round(config.xpBase * 0.4 + Math.min(1500, player.driftScore / 30));
    credits += c;
    xp += x;
    breakdown.push({ label: `Pontuação de drift`, credits: c, xp: x });
    reputation += Math.min(30, Math.round(player.driftScore / 1500));
  } else {
    const c = Math.round(config.rewardBase * 0.5);
    const x = Math.round(config.xpBase * 0.6);
    credits += c;
    xp += x;
    breakdown.push({ label: 'Sessão concluída', credits: c, xp: x });
    reputation += 4;
  }

  if (options.newRecord) {
    const c = Math.round(config.rewardBase * 0.25);
    const x = Math.round(config.xpBase * 0.25);
    credits += c;
    xp += x;
    breakdown.push({ label: 'Novo recorde pessoal', credits: c, xp: x });
  }
  if (mode.hasOpponents && player.driftScore > 0) {
    const x = Math.min(300, Math.round(player.driftScore / 40));
    if (x > 0) {
      xp += x;
      breakdown.push({ label: 'Bônus de drift', credits: 0, xp: x });
    }
  }
  if (options.cleanRace && mode.hasOpponents) {
    const c = Math.round(config.rewardBase * 0.1);
    const x = Math.round(config.xpBase * 0.15);
    credits += c;
    xp += x;
    breakdown.push({ label: 'Corrida limpa (sem batidas fortes)', credits: c, xp: x });
  }
  const achieved = objectives.filter((o) => o.achieved).length;
  if (achieved > 0 && objectives.length > 0) {
    const c = Math.round(config.rewardBase * 0.1 * achieved);
    credits += c;
    breakdown.push({ label: `Objetivos cumpridos (${achieved}/${objectives.length})`, credits: c, xp: 0 });
  }
  return { credits, xp, reputation, breakdown };
}

export function buildRaceResults(session: RaceSession, trackName: string, personalBestLap: number | null): RaceResults {
  const results = session.buildRacerResults();
  const player = results.find((r) => r.isPlayer)!;
  const objectives = evaluateObjectives(session.config, player);
  const newRecord = player.bestLap !== null && (personalBestLap === null || player.bestLap < personalBestLap - 1e-6);
  const racer = session.player;
  const rewards = computeRewards(session.config, player, objectives, {
    newRecord,
    racers: results.length,
    cleanRace: racer.collisions === 0,
  });
  return {
    resultId: session.sessionId,
    config: session.config,
    trackName,
    results,
    player,
    objectives,
    rewards,
    valid: player.finished && MODES[session.config.mode].rewards,
    driftScore: racer.drift.total,
    bestDriftChain: racer.drift.bestChain,
    collisions: racer.collisions,
    distance: racer.distance,
    topSpeed: racer.topSpeed,
    durationSeconds: session.raceTime,
  };
}
