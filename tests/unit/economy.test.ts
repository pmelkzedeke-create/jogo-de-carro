import { describe, expect, it } from 'vitest';
import { applyRaceResults, buyPaint, buyVehicle, canBuyVehicle } from '../../src/career/CareerManager';
import { levelFromXp, xpForLevel } from '../../src/career/Progression';
import { createDefaultSave } from '../../src/persistence/SaveSchema';
import { computeRewards, evaluateObjectives } from '../../src/racing/RaceRewards';
import type { RaceConfig, RaceResults, RacerResult } from '../../src/racing/RaceTypes';

function config(partial: Partial<RaceConfig> = {}): RaceConfig {
  return {
    mode: 'quickRace',
    trackId: 'costa-azul',
    laps: 3,
    player: { id: 'player', name: 'P', vehicleId: 'valkar-sprint-gt', paint: 'glacier' },
    opponents: [],
    difficulty: 'normal',
    seed: 1,
    objectives: [{ type: 'position', value: 3, label: 'Pódio' }],
    rewardBase: 5000,
    xpBase: 400,
    assist: 0.6,
    ...partial,
  };
}

function results(position: number, id = 'race-1', finished = true): RaceResults {
  const player: RacerResult = {
    id: 'player',
    name: 'P',
    vehicleId: 'valkar-sprint-gt',
    isPlayer: true,
    position,
    finished,
    dnf: !finished,
    totalTime: finished ? 180 : null,
    bestLap: 59.5,
    lapTimes: [61, 59.5, 59.5],
    gapToLeader: null,
    progress: 0,
    driftScore: 1200,
    rival: false,
  };
  const cfg = config();
  const objectives = evaluateObjectives(cfg, player);
  const rewards = computeRewards(cfg, player, objectives, { newRecord: true, racers: 6, cleanRace: true });
  return {
    resultId: id,
    config: cfg,
    trackName: 'Costa Azul',
    results: [player, ...Array.from({ length: 5 }, (_, i) => ({ ...player, id: `ai${i}`, isPlayer: false, position: i + 2 }))],
    player,
    objectives,
    rewards,
    valid: finished,
    driftScore: 1200,
    bestDriftChain: 800,
    collisions: 0,
    distance: 6000,
    topSpeed: 50,
    durationSeconds: 180,
  };
}

describe('Economia e progressão', () => {
  it('recompensa é aplicada uma única vez por resultado', () => {
    const save = createDefaultSave();
    const r = results(1);
    const first = applyRaceResults(save, r);
    expect(first.applied).toBe(true);
    expect(first.save.profile.credits).toBe(save.profile.credits + r.rewards.credits);
    const again = applyRaceResults(first.save, r);
    expect(again.applied).toBe(false);
    expect(again.save.profile.credits).toBe(first.save.profile.credits);
    expect(again.save.stats.racesStarted).toBe(first.save.stats.racesStarted);
  });

  it('posições piores rendem menos; não concluir não rende nada', () => {
    const p1 = results(1).rewards.credits;
    const p4 = results(4).rewards.credits;
    expect(p1).toBeGreaterThan(p4);
    const dnf = results(6, 'x', false);
    expect(dnf.rewards.credits).toBe(0);
    const outcome = applyRaceResults(createDefaultSave(), dnf);
    expect(outcome.save.profile.credits).toBe(createDefaultSave().profile.credits);
  });

  it('registra recorde, histórico e estatísticas', () => {
    const outcome = applyRaceResults(createDefaultSave(), results(1));
    expect(outcome.newRecord).toBe(true);
    expect(outcome.save.records['costa-azul'].bestLap).toBeCloseTo(59.5);
    expect(outcome.save.history).toHaveLength(1);
    expect(outcome.save.stats.wins).toBe(1);
    expect(outcome.save.stats.podiums).toBe(1);
  });

  it('compra exige desbloqueio e saldo; não permite comprar duas vezes', () => {
    let save = createDefaultSave();
    expect(canBuyVehicle(save, 'kestrel-rs4')).toBe('locked');
    save.profile.xp = xpForLevel(2);
    // O perfil inicial (15.000 CR) não cobre os 18.000 CR do RS-4.
    expect(canBuyVehicle(save, 'kestrel-rs4')).toBe('funds');
    save.profile.credits = 18000;
    expect(canBuyVehicle(save, 'kestrel-rs4')).toBe(null);
    save.profile.credits = 100;
    expect(canBuyVehicle(save, 'kestrel-rs4')).toBe('funds');
    save.profile.credits = 50000;
    const bought = buyVehicle(save, 'kestrel-rs4');
    expect(bought.error).toBeNull();
    save = bought.save;
    expect(save.profile.credits).toBe(50000 - 18000);
    expect(buyVehicle(save, 'kestrel-rs4').error).toBe('owned');
    const paint = buyPaint(save, 'kestrel-rs4', 'quartz');
    expect(paint.error).toBeNull();
    expect(paint.save.profile.credits).toBe(save.profile.credits - 1200);
    // Selecionar uma pintura já comprada não cobra novamente.
    const again = buyPaint(paint.save, 'kestrel-rs4', 'quartz');
    expect(again.save.profile.credits).toBe(paint.save.profile.credits);
  });

  it('curva de níveis é monotônica', () => {
    let prev = -1;
    for (let level = 1; level <= 50; level++) {
      const xp = xpForLevel(level);
      expect(xp).toBeGreaterThan(prev);
      expect(levelFromXp(xp)).toBe(level);
      prev = xp;
    }
  });
});
