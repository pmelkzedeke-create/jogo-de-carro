import { test } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three';
import { createAIDriver } from '../src/ai/AIFactory';
import { DIFFICULTIES } from '../src/ai/Difficulty';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import type { RapierModule } from '../src/physics/rapier';
import { createProjection } from '../src/tracks/Track';
import { buildTrack } from '../src/tracks/TrackBuilder';
import { TRACKS } from '../src/tracks/TrackCatalog';
import { buildTrackColliders, buildTrackRibbons } from '../src/tracks/TrackColliders';
import { buildTerrain } from '../src/tracks/Terrain';
import { getVehicle } from '../src/vehicles/VehicleCatalog';
import { resolvePhysics } from '../src/vehicles/VehicleConfig';
import { VehiclePhysics } from '../src/vehicles/VehiclePhysics';

const CASES = (process.env.CASES ?? 'costa-azul:orion-apex-r,estrada-mirante:arcadia-volt-e').split(',');

test('diagnose', async () => {
  await RAPIER.init();
  const R = RAPIER as unknown as RapierModule;
  for (const c of CASES) {
    const [trackId, vehicleId] = c.split(':');
    const track = buildTrack(TRACKS.find((t) => t.id === trackId)!);
    const world = new PhysicsWorld(R, 1 / 120);
    buildTrackColliders(world, track, buildTrackRibbons(track), buildTerrain(track));
    const vdef = getVehicle(vehicleId);
    const phys = resolvePhysics(vdef.physics);
    const slot = track.grid[0];
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), slot.forward.clone().setY(0).normalize());
    const car = new VehiclePhysics(world, vdef, slot.position.clone().setY(slot.position.y + phys.rideHeight + 0.1), q, 'ai');
    const ai = createAIDriver(track, car, DIFFICULTIES.hard, `${trackId}-${vehicleId}`);
    const proj = createProjection();
    let hint = -1;
    let t = 0;
    let wasOff = false;
    const dt = 1 / 120;
    while (t < 90) {
      track.project(car.position, hint, proj);
      hint = proj.index;
      const off = Math.abs(proj.lateral) - (track.halfWidth + track.shoulderWidth);
      const target = ai.targetSpeedAt(proj.s + Math.abs(car.forwardSpeed) * 0.35);
      if (off > 0.5 && !wasOff) {
        console.log(`[${trackId}/${vehicleId}] SAIU t=${t.toFixed(1)} s=${proj.s.toFixed(0)} (dist corrida ${track.raceDistance(proj.s).toFixed(0)}) lat=${proj.lateral.toFixed(1)} v=${(car.forwardSpeed * 3.6).toFixed(0)} alvo=${(target * 3.6).toFixed(0)} drift=${(car.driftAngle * 57.3).toFixed(1)}° steer=${ai.controls.steer.toFixed(2)} brake=${ai.controls.brake.toFixed(2)} curv=${(track.curvatureAt(proj.s) * 1000).toFixed(1)}e-3`);
      }
      wasOff = off > 0.5;
      if (Math.round(t * 120) % 240 === 0) {
        // amostra periódica
        console.log(`  t=${t.toFixed(0)} s=${proj.s.toFixed(0)} lat=${proj.lateral.toFixed(1)} v=${(car.forwardSpeed * 3.6).toFixed(0)} alvo=${(target * 3.6).toFixed(0)} g=${car.drivetrain.gear} rpm=${car.drivetrain.rpm.toFixed(0)} drift=${(car.driftAngle * 57.3).toFixed(1)}`);
      }
      ai.update(dt, { id: 'ai', s: proj.s, progress: 0, lateral: proj.lateral, speed: car.speed, ghost: false }, []);
      Object.assign(car.controls, ai.controls);
      car.snapshot();
      car.step(dt);
      world.step();
      car.postStep(dt);
      t += dt;
    }
    world.dispose();
  }
});
