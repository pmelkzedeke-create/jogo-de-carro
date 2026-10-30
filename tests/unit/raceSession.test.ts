import { beforeAll, describe, expect, it } from 'vitest';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import type { RapierModule } from '../../src/physics/rapier';
import { buildRaceResults } from '../../src/racing/RaceRewards';
import { RaceSession } from '../../src/racing/RaceSession';
import type { RaceConfig } from '../../src/racing/RaceTypes';
import { buildTrack } from '../../src/tracks/TrackBuilder';
import { TRACKS } from '../../src/tracks/TrackCatalog';
import { buildTrackColliders, buildTrackRibbons } from '../../src/tracks/TrackColliders';
import { buildTerrain } from '../../src/tracks/Terrain';
import { initRapier } from './helpers/physicsHarness';

let R: RapierModule;
beforeAll(async () => {
  R = await initRapier();
});

function setup(trackId: string, config: Partial<RaceConfig>) {
  const track = buildTrack(TRACKS.find((t) => t.id === trackId)!);
  const physics = new PhysicsWorld(R, 1 / 120);
  buildTrackColliders(physics, track, buildTrackRibbons(track), buildTerrain(track));
  const full: RaceConfig = {
    mode: 'quickRace',
    trackId,
    laps: 2,
    player: { id: 'player', name: 'Jogador', vehicleId: 'kestrel-rs4', paint: 'abyss' },
    opponents: [
      { id: 'ai1', name: 'A', vehicleId: 'valkar-sprint-gt', paint: 'onyx' },
      { id: 'ai2', name: 'B', vehicleId: 'kestrel-rs4', paint: 'glacier' },
      { id: 'ai3', name: 'C', vehicleId: 'sable-nero-v8', paint: 'apex-red' },
      { id: 'ai4', name: 'D', vehicleId: 'valkar-sprint-gt', paint: 'jade' },
      { id: 'ai5', name: 'E', vehicleId: 'kestrel-rs4', paint: 'titanium' },
    ],
    difficulty: 'normal',
    seed: 1234,
    objectives: [{ type: 'position', value: 3, label: 'Terminar no pódio' }],
    rewardBase: 5000,
    xpBase: 400,
    assist: 0.6,
    ...config,
  };
  const session = new RaceSession({ physics, track, config: full, playerAutopilot: true, skipIntro: true });
  return { session, physics, track };
}

describe('RaceSession (sessão completa sem renderização)', () => {
  it('corrida de 2 voltas com 6 carros chega à classificação final coerente', () => {
    const { session, physics } = setup('costa-azul', {});
    const events: string[] = [];
    let recoveries = 0;
    let impacts = 0;
    session.events.on('phase', (e) => events.push(`phase:${e.phase}`));
    session.events.on('finish', (e) => events.push(`finish:${e.racer.id}:${e.position}`));
    session.events.on('recovered', () => recoveries++);
    session.events.on('impact', () => impacts++);
    const dt = physics.fixedDt;
    let steps = 0;
    const t0 = performance.now();
    while (!session.complete && steps < 120 * 400) {
      session.step(dt);
      steps++;
    }
    const elapsed = performance.now() - t0;
    const results = session.buildRacerResults();
    // eslint-disable-next-line no-console
    console.log(
      `Simulados ${(steps * dt).toFixed(1)} s em ${(elapsed / 1000).toFixed(1)} s reais (${((elapsed / steps) * 1000).toFixed(0)} µs/passo com 6 carros). Recuperações: ${recoveries}, impactos: ${impacts}\n` +
        results.map((r) => `${r.position}. ${r.id} ${r.vehicleId} ${r.finished ? r.totalTime!.toFixed(2) + ' s' : 'DNF'} melhor volta ${r.bestLap?.toFixed(2)}`).join('\n'),
    );
    expect(session.complete).toBe(true);
    expect(events).toContain('phase:racing');
    expect(results.filter((r) => r.finished).length).toBeGreaterThanOrEqual(5);
    // Posições únicas e ordenadas, concluintes por tempo.
    expect(results.map((r) => r.position)).toEqual([1, 2, 3, 4, 5, 6]);
    const finished = results.filter((r) => r.finished);
    for (let i = 1; i < finished.length; i++) expect(finished[i].totalTime!).toBeGreaterThanOrEqual(finished[i - 1].totalTime!);
    for (const r of finished) expect(r.lapTimes).toHaveLength(2);
    const built = buildRaceResults(session, 'Costa Azul', null);
    expect(built.player.finished).toBe(true);
    expect(built.rewards.credits).toBeGreaterThan(0);
    expect(built.valid).toBe(true);
    session.dispose();
    physics.dispose();
  });

  it('recuperação manual não altera voltas e coloca o carro na pista, no sentido correto', () => {
    const { session, physics, track } = setup('porto-industrial', { opponents: [], mode: 'practice' });
    const dt = physics.fixedDt;
    for (let i = 0; i < 120 * 25; i++) session.step(dt);
    const player = session.player;
    const progressBefore = player.lap.progress;
    const lapsBefore = player.lap.lapsCompleted;
    expect(progressBefore).toBeGreaterThan(1);
    // Joga o carro para fora da pista de forma artificial e recupera.
    player.vehicle.body.setTranslation({ x: player.vehicle.position.x + 200, y: player.vehicle.position.y + 30, z: player.vehicle.position.z }, true);
    for (let i = 0; i < 10; i++) session.step(dt);
    player.recoverCooldown = 0;
    expect(session.recover(player, false)).toBe(true);
    for (let i = 0; i < 120; i++) session.step(dt);
    expect(player.lap.progress).toBe(progressBefore);
    expect(player.lap.lapsCompleted).toBe(lapsBefore);
    expect(Math.abs(player.projection.lateral)).toBeLessThan(track.halfWidth);
    const frame = track.sampleAt(player.projection.s);
    expect(player.vehicle.forward.dot(frame.tangent)).toBeGreaterThan(0.9);
    session.dispose();
    physics.dispose();
  });

  it('contrarrelógio termina após as voltas configuradas', () => {
    const { session, physics } = setup('serra-verde', { mode: 'timeTrial', opponents: [], laps: 1 });
    const dt = physics.fixedDt;
    let steps = 0;
    while (!session.complete && steps < 120 * 200) {
      session.step(dt);
      steps++;
    }
    expect(session.complete).toBe(true);
    expect(session.player.lap.lapTimes).toHaveLength(1);
    session.dispose();
    physics.dispose();
  });
});
