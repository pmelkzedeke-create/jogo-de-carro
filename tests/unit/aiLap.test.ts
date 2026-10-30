import { beforeAll, describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { createAIDriver } from '../../src/ai/AIFactory';
import { DIFFICULTIES } from '../../src/ai/Difficulty';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import type { RapierModule } from '../../src/physics/rapier';
import { GateTracker, type GateCrossing } from '../../src/racing/CheckpointSystem';
import { LapCounter } from '../../src/racing/LapCounter';
import { createProjection } from '../../src/tracks/Track';
import { buildTrack } from '../../src/tracks/TrackBuilder';
import { TRACKS } from '../../src/tracks/TrackCatalog';
import { buildTrackColliders, buildTrackRibbons } from '../../src/tracks/TrackColliders';
import { buildTerrain } from '../../src/tracks/Terrain';
import { getVehicle } from '../../src/vehicles/VehicleCatalog';
import { resolvePhysics } from '../../src/vehicles/VehicleConfig';
import { VehiclePhysics } from '../../src/vehicles/VehiclePhysics';
import { initRapier } from './helpers/physicsHarness';

let R: RapierModule;
beforeAll(async () => {
  R = await initRapier();
});

function runLap(trackId: string, vehicleId: string, difficulty: keyof typeof DIFFICULTIES, maxSeconds = 240) {
  const def = TRACKS.find((t) => t.id === trackId)!;
  const track = buildTrack(def);
  const world = new PhysicsWorld(R, 1 / 120);
  const terrain = buildTerrain(track);
  buildTrackColliders(world, track, buildTrackRibbons(track), terrain);
  const vdef = getVehicle(vehicleId);
  const phys = resolvePhysics(vdef.physics);
  const slot = track.grid[0];
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), slot.forward.clone().setY(0).normalize());
  const car = new VehiclePhysics(world, vdef, slot.position.clone().setY(slot.position.y + phys.rideHeight + 0.1), q, 'ai');
  const ai = createAIDriver(track, car, DIFFICULTIES[difficulty], `${trackId}-${vehicleId}`);
  const tracker = new GateTracker(track.gates);
  const counter = new LapCounter(track.gates.length, track.closed, 1, 'green');
  tracker.reset(car.position);
  counter.start(0);
  const proj = createProjection();
  let hint = -1;
  let offTrackSteps = 0;
  let maxOff = 0;
  let maxSpeed = 0;
  const crossings: GateCrossing[] = [];
  const dt = world.fixedDt;
  let t = 0;
  while (t < maxSeconds && !counter.finished) {
    track.project(car.position, hint, proj);
    hint = proj.index;
    const off = Math.abs(proj.lateral) - (track.halfWidth + track.shoulderWidth);
    if (off > 0.5) offTrackSteps++;
    maxOff = Math.max(maxOff, off);
    ai.update(dt, { id: 'ai', s: proj.s, progress: 0, lateral: proj.lateral, speed: car.speed, ghost: false }, []);
    Object.assign(car.controls, ai.controls);
    car.snapshot();
    car.step(dt);
    world.step();
    car.postStep(dt);
    maxSpeed = Math.max(maxSpeed, car.speed);
    t += dt;
    crossings.length = 0;
    tracker.update(car.position, crossings);
    for (const c of crossings) counter.handleCrossing(c, t);
    if (car.invalidState || car.upsideDownTime > 1) break;
  }
  world.dispose();
  return { finished: counter.finished, time: counter.finishTime, offTrackSeconds: offTrackSteps * dt, maxOff, maxSpeed, length: track.raceLength };
}

describe('IA completa voltas reais (pista + física + regras de volta)', () => {
  const cases: Array<[string, string, keyof typeof DIFFICULTIES]> = [
    ['costa-azul', 'valkar-sprint-gt', 'hard'],
    ['costa-azul', 'orion-apex-r', 'hard'],
    ['serra-verde', 'kestrel-rs4', 'hard'],
    ['porto-industrial', 'sable-nero-v8', 'hard'],
    ['estrada-mirante', 'arcadia-volt-e', 'hard'],
    ['costa-azul', 'valkar-sprint-gt', 'easy'],
  ];
  for (const [trackId, vehicleId, difficulty] of cases) {
    it(`${trackId} com ${vehicleId} (${difficulty})`, () => {
      const r = runLap(trackId, vehicleId, difficulty);
      // eslint-disable-next-line no-console
      console.log(`${trackId} / ${vehicleId} / ${difficulty}: ${r.finished ? `${r.time!.toFixed(2)} s` : 'NÃO TERMINOU'} | média ${((r.length / (r.time ?? 1)) * 3.6).toFixed(0)} km/h | máx ${(r.maxSpeed * 3.6).toFixed(0)} km/h | fora da pista ${r.offTrackSeconds.toFixed(1)} s (máx ${r.maxOff.toFixed(1)} m)`);
      expect(r.finished).toBe(true);
      expect(r.offTrackSeconds).toBeLessThan(3);
    });
  }
});
