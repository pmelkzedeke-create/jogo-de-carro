/**
 * Fase 3 — IA em corrida: dificuldade mensurável, disputa entre carros e regras iguais às do jogador.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import type { RapierModule } from '../../src/physics/rapier';
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

function run(trackId: string, difficulty: RaceConfig['difficulty'], opponents: RaceConfig['opponents'], laps = 1, maxSeconds = 300) {
  const track = buildTrack(TRACKS.find((t) => t.id === trackId)!);
  const physics = new PhysicsWorld(R, 1 / 120);
  buildTrackColliders(physics, track, buildTrackRibbons(track), buildTerrain(track));
  const config: RaceConfig = {
    mode: 'quickRace',
    trackId,
    laps,
    player: { id: 'player', name: 'Jogador', vehicleId: 'valkar-sprint-gt', paint: 'glacier' },
    opponents,
    difficulty,
    seed: 99,
    objectives: [],
    rewardBase: 1000,
    xpBase: 100,
    assist: 0.6,
  };
  const session = new RaceSession({ physics, track, config, playerAutopilot: true, skipIntro: true });
  let impacts = 0;
  let recoveries = 0;
  session.events.on('impact', (e) => {
    if (e.intensity > 3 && e.otherKind === 'car') impacts++;
  });
  session.events.on('recovered', () => recoveries++);
  let steps = 0;
  while (!session.complete && steps < maxSeconds * 120) {
    session.step(physics.fixedDt);
    steps++;
  }
  const results = session.buildRacerResults();
  session.dispose();
  physics.dispose();
  return { results, impacts, recoveries, complete: steps < maxSeconds * 120 };
}

describe('IA em corrida', () => {
  it('dificuldade altera o ritmo de forma mensurável (Fácil > Normal > Difícil em tempo de volta)', () => {
    const times: Record<string, number> = {};
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const { results } = run('costa-azul', difficulty, [{ id: 'ai-1', name: 'IA', vehicleId: 'kestrel-rs4', paint: 'onyx' }]);
      const ai = results.find((r) => r.id === 'ai-1')!;
      expect(ai.finished).toBe(true);
      times[difficulty] = ai.totalTime!;
    }
    // eslint-disable-next-line no-console
    console.log(`Tempo da IA (1 volta, Costa Azul, RS-4): Fácil ${times.easy.toFixed(2)} s | Normal ${times.normal.toFixed(2)} s | Difícil ${times.hard.toFixed(2)} s`);
    expect(times.easy).toBeGreaterThan(times.normal);
    expect(times.normal).toBeGreaterThan(times.hard);
  });

  it('pelotão de 8 carros completa a corrida com poucas batidas fortes e sem recuperações em massa', () => {
    const opponents = [
      ['kestrel-rs4', 'onyx'],
      ['sable-nero-v8', 'apex-red'],
      ['valkar-sprint-gt', 'jade'],
      ['arcadia-volt-e', 'quartz'],
      ['kestrel-rs4', 'glacier'],
      ['sable-nero-v8', 'solar'],
      ['valkar-sprint-gt', 'abyss'],
    ].map(([vehicleId, paint], i) => ({ id: `ai-${i + 1}`, name: `IA ${i + 1}`, vehicleId, paint }));
    const { results, impacts, recoveries, complete } = run('serra-verde', 'hard', opponents, 1, 360);
    // eslint-disable-next-line no-console
    console.log(
      `8 carros (Difícil, Serra Verde): impactos fortes entre carros ${impacts}, recuperações ${recoveries}\n` +
        results.map((r) => `${r.position}. ${r.id} ${r.vehicleId} ${r.finished ? r.totalTime!.toFixed(2) : 'DNF'}`).join('\n'),
    );
    expect(complete).toBe(true);
    expect(results.filter((r) => r.finished).length).toBeGreaterThanOrEqual(7);
    expect(recoveries).toBeLessThanOrEqual(3);
    expect(impacts).toBeLessThan(40);
  });
});
